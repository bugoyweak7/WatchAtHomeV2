package com.nuvio.app.features.watching.sync

import com.nuvio.app.core.auth.FirebaseAuthRepository
import com.nuvio.app.core.network.CloudflareWorkerConfig
import com.nuvio.app.core.network.createApiHttpClient
import com.nuvio.app.core.network.readBoundedResponseBody
import com.nuvio.app.core.sync.SyncClientIdentity
import com.nuvio.app.features.watched.WatchedItem
import com.nuvio.app.features.watched.normalizeWatchedMarkedAtEpochMs
import io.ktor.client.HttpClient
import io.ktor.client.request.header
import io.ktor.client.request.request
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsChannel
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.contentType
import io.ktor.utils.io.errors.IOException
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json

/**
 * Worker-backed watched-items sync. WatchedRepository selects this adapter only when
 * CLOUDFLARE_SYNC_ENABLED is explicitly true and an HTTPS Worker URL is configured.
 * The global flag remains disabled until Firebase auth and production Worker/D1 are verified.
 */
internal class CloudflareWatchedSyncHttpAdapter(
    private val baseUrl: String,
    private val tokenProvider: suspend () -> String?,
    private val httpClient: HttpClient,
) : WatchedSyncAdapter {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    override suspend fun pull(profileId: Int, pageSize: Int): List<WatchedItem> {
        requireProfile(profileId)
        require(pageSize > 0) { "Invalid watched-items page size." }
        val boundedPageSize = pageSize.coerceAtMost(MAX_PAGE_SIZE)
        val items = mutableListOf<WatchedItem>()
        var offset = 0
        while (true) {
            val body = execute(
                HttpMethod.Get,
                profilePath(profileId) + "/watched-items?limit=$boundedPageSize&offset=$offset",
            )
            val page = json.decodeFromString<List<WatchedWireItem>>(body)
            items += page.map(WatchedWireItem::toWatchedItem)
            if (page.size < boundedPageSize) return items
            offset += boundedPageSize
            require(offset <= MAX_SNAPSHOT_OFFSET) { "Watched-items snapshot exceeds the supported page range." }
        }
    }

    override suspend fun getDeltaCursor(profileId: Int): Long {
        requireProfile(profileId)
        return json.decodeFromString(
            execute(HttpMethod.Get, profilePath(profileId) + "/watched-items/cursor"),
        )
    }

    override suspend fun pullDelta(
        profileId: Int,
        sinceEventId: Long,
        limit: Int,
    ): List<WatchedDeltaEvent> {
        requireProfile(profileId)
        require(sinceEventId >= 0L && limit in 1..MAX_PAGE_SIZE) { "Invalid watched-items delta page." }
        val body = execute(
            HttpMethod.Get,
            profilePath(profileId) + "/watched-items/delta?since=$sinceEventId&limit=$limit",
        )
        return json.decodeFromString<List<WatchedDeltaWireItem>>(body).map { event ->
            WatchedDeltaEvent(
                eventId = event.eventId,
                operation = event.operation,
                contentId = event.contentId,
                contentType = event.contentType,
                title = event.title,
                season = event.season,
                episode = event.episode,
                watchedAt = event.watchedAt,
            )
        }
    }

    override suspend fun push(profileId: Int, items: Collection<WatchedItem>) {
        requireProfile(profileId)
        sendBatches(
            path = profilePath(profileId) + "/watched-items",
            method = HttpMethod.Put,
            values = items.toList(),
        ) { batch ->
            json.encodeToString(
                WatchedPushRequest(
                    items = batch.map(WatchedItem::toWireItem),
                    pOriginClientId = SyncClientIdentity.currentClientId(),
                ),
            )
        }
    }

    override suspend fun delete(profileId: Int, items: Collection<WatchedItem>) {
        requireProfile(profileId)
        val keys = items.map { item ->
            CloudflareWatchedDeleteKey(
                contentId = item.id,
                season = item.season,
                episode = item.episode,
            )
        }.distinctBy { Triple(it.contentId, it.season, it.episode) }
        sendBatches(
            path = profilePath(profileId) + "/watched-items/delete",
            method = HttpMethod.Post,
            values = keys,
        ) { batch ->
            json.encodeToString(
                WatchedDeleteRequest(
                    keys = batch,
                    pOriginClientId = SyncClientIdentity.currentClientId(),
                ),
            )
        }
    }

    private suspend fun <T> sendBatches(
        path: String,
        method: HttpMethod,
        values: List<T>,
        encode: (List<T>) -> String,
    ) {
        var batch = mutableListOf<T>()
        for (value in values) {
            val candidate = batch + value
            val encoded = encode(candidate)
            if (encoded.encodeToByteArray().size > MAX_REQUEST_BODY_BYTES) {
                if (batch.isEmpty()) throw IOException("A watched item exceeds the request size limit.")
                execute(method, path, encode(batch))
                batch = mutableListOf(value)
                if (encode(batch).encodeToByteArray().size > MAX_REQUEST_BODY_BYTES) {
                    throw IOException("A watched item exceeds the request size limit.")
                }
            } else {
                batch = candidate.toMutableList()
            }
        }
        if (batch.isNotEmpty()) execute(method, path, encode(batch))
    }

    private suspend fun execute(method: HttpMethod, path: String, body: String? = null): String {
        val root = baseUrl.trim().trimEnd('/')
        if (!root.startsWith("https://", ignoreCase = true)) {
            throw IOException("Cloudflare Worker URL is not configured with HTTPS.")
        }
        val token = tokenProvider()?.takeIf(String::isNotBlank)
            ?: throw IOException("A signed-in Firebase account is required for watched-items sync.")
        val response = httpClient.request(root + path) {
            this.method = method
            header(HttpHeaders.Authorization, "Bearer $token")
            if (body != null) {
                contentType(ContentType.Application.Json)
                setBody(body)
            }
        }
        val responseBody = readBoundedResponseBody(
            response.bodyAsChannel(),
            response.headers[HttpHeaders.ContentLength]?.toLongOrNull(),
            maxBytes = MAX_RESPONSE_BODY_BYTES,
        )
        if (response.status.value !in 200..299) {
            throw IOException("Cloudflare watched-items API request failed (HTTP ${response.status.value}).")
        }
        return responseBody
    }

    private fun profilePath(profileId: Int) = "/v1/profiles/$profileId"

    private fun requireProfile(profileId: Int) {
        require(profileId in 1..100) { "Invalid profile ID." }
    }

    companion object {
        private const val MAX_PAGE_SIZE = 500
        private const val MAX_SNAPSHOT_OFFSET = 1_000_000
        private const val MAX_REQUEST_BODY_BYTES = 192 * 1024
        private const val MAX_RESPONSE_BODY_BYTES = 2 * 1024 * 1024
    }
}

@Serializable
private data class WatchedWireItem(
    @SerialName("content_id") val contentId: String,
    @SerialName("content_type") val contentType: String,
    val title: String = "",
    val season: Int? = null,
    val episode: Int? = null,
    @SerialName("watched_at") val watchedAt: Long = 0L,
) {
    fun toWatchedItem() = WatchedItem(
        id = contentId,
        type = contentType,
        name = title,
        season = season,
        episode = episode,
        markedAtEpochMs = normalizeWatchedMarkedAtEpochMs(watchedAt),
    )
}

@Serializable
private data class WatchedDeltaWireItem(
    @SerialName("event_id") val eventId: Long,
    val operation: String,
    @SerialName("content_id") val contentId: String,
    @SerialName("content_type") val contentType: String,
    val title: String = "",
    val season: Int? = null,
    val episode: Int? = null,
    @SerialName("watched_at") val watchedAt: Long = 0L,
)

@Serializable
private data class WatchedPushRequest(
    val items: List<WatchedWireItem>,
    @SerialName("p_origin_client_id") val pOriginClientId: String,
)

@Serializable
private data class WatchedDeleteRequest(
    val keys: List<CloudflareWatchedDeleteKey>,
    @SerialName("p_origin_client_id") val pOriginClientId: String,
)

@Serializable
private data class CloudflareWatchedDeleteKey(
    @SerialName("content_id") val contentId: String,
    val season: Int? = null,
    val episode: Int? = null,
)

private fun WatchedItem.toWireItem() = WatchedWireItem(
    contentId = id,
    contentType = type,
    title = name,
    season = season,
    episode = episode,
    watchedAt = normalizeWatchedMarkedAtEpochMs(markedAtEpochMs),
)

/** Production-configured staged adapter; not wired unless the guarded sync flag is enabled. */
object CloudflareWatchedSyncAdapter : WatchedSyncAdapter by CloudflareWatchedSyncHttpAdapter(
    baseUrl = CloudflareWorkerConfig.BASE_URL,
    tokenProvider = { FirebaseAuthRepository.getFreshIdToken() },
    httpClient = createApiHttpClient(),
)
