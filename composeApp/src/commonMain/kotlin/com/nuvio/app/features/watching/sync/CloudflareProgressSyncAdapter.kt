package com.nuvio.app.features.watching.sync

import com.nuvio.app.core.auth.FirebaseAuthRepository
import com.nuvio.app.core.network.CloudflareWorkerConfig
import com.nuvio.app.core.network.createApiHttpClient
import com.nuvio.app.core.network.readBoundedResponseBody
import com.nuvio.app.core.sync.SyncClientIdentity
import com.nuvio.app.features.watchprogress.WatchProgressEntry
import com.nuvio.app.features.watchprogress.resolvedProgressKey
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
 * Staged Worker-backed progress sync. WatchProgressRepository continues to use
 * SupabaseProgressSyncAdapter until the Worker/D1 environment is provisioned and verified.
 */
internal class CloudflareProgressSyncHttpAdapter(
    private val baseUrl: String,
    private val tokenProvider: suspend () -> String?,
    private val httpClient: HttpClient,
) : ProgressSyncAdapter {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    override suspend fun pull(
        profileId: Int,
        sinceLastWatched: Long?,
        limit: Int?,
    ): List<ProgressSyncRecord> {
        requireProfile(profileId)
        require(sinceLastWatched == null || sinceLastWatched >= 0L)
        val pageSize = (limit ?: PAGE_SIZE).coerceIn(1, PAGE_SIZE)
        val records = mutableListOf<ProgressSyncRecord>()
        var offset = 0
        while (true) {
            val query = buildString {
                append("?limit=").append(pageSize)
                append("&offset=").append(offset)
                if (sinceLastWatched != null) append("&sinceLastWatched=").append(sinceLastWatched)
            }
            val body = execute(
                HttpMethod.Get,
                profilePath(profileId) + "/watch-progress" + query,
            )
            val page = json.decodeFromString<List<ProgressWireEntry>>(body)
            records += page.map(ProgressWireEntry::toSyncRecord)
            if (page.size < pageSize) return records
            offset += pageSize
            require(offset <= MAX_SNAPSHOT_OFFSET) { "Watch progress snapshot exceeds the supported page range." }
        }
    }

    override suspend fun getDeltaCursor(profileId: Int): Long {
        requireProfile(profileId)
        return json.decodeFromString(
            execute(HttpMethod.Get, profilePath(profileId) + "/watch-progress/cursor"),
        )
    }

    override suspend fun pullDelta(
        profileId: Int,
        sinceEventId: Long,
        limit: Int,
    ): List<ProgressDeltaEvent> {
        requireProfile(profileId)
        require(sinceEventId >= 0L && limit in 1..MAX_PAGE_SIZE)
        val body = execute(
            HttpMethod.Get,
            profilePath(profileId) + "/watch-progress/delta?since=$sinceEventId&limit=$limit",
        )
        return json.decodeFromString<List<ProgressDeltaWireEntry>>(body).map { event ->
            ProgressDeltaEvent(
                eventId = event.eventId,
                operation = event.operation,
                progressKey = event.progressKey,
                contentId = event.contentId,
                contentType = event.contentType,
                videoId = event.videoId,
                season = event.season,
                episode = event.episode,
                position = event.position,
                duration = event.duration,
                lastWatched = event.lastWatched,
            )
        }
    }

    override suspend fun push(profileId: Int, entries: Collection<WatchProgressEntry>) {
        requireProfile(profileId)
        sendBatches(
            path = profilePath(profileId) + "/watch-progress",
            method = HttpMethod.Put,
            values = entries.toList(),
        ) { batch ->
            json.encodeToString(
                ProgressPushRequest(
                    entries = batch.map(WatchProgressEntry::toWireEntry),
                    pOriginClientId = SyncClientIdentity.currentClientId(),
                ),
            )
        }
    }

    override suspend fun delete(profileId: Int, entries: Collection<WatchProgressEntry>) {
        requireProfile(profileId)
        sendBatches(
            path = profilePath(profileId) + "/watch-progress/delete",
            method = HttpMethod.Post,
            values = entries.map(WatchProgressEntry::resolvedProgressKey).distinct(),
        ) { batch ->
            json.encodeToString(
                ProgressDeleteRequest(
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
                if (batch.isEmpty()) throw IOException("A watch progress entry exceeds the request size limit.")
                execute(method, path, encode(batch))
                batch = mutableListOf(value)
                if (encode(batch).encodeToByteArray().size > MAX_REQUEST_BODY_BYTES) {
                    throw IOException("A watch progress entry exceeds the request size limit.")
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
            ?: throw IOException("A signed-in Firebase account is required for watch progress sync.")
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
            throw IOException("Cloudflare watch progress API request failed (HTTP ${response.status.value}).")
        }
        return responseBody
    }

    private fun profilePath(profileId: Int) = "/v1/profiles/$profileId"

    private fun requireProfile(profileId: Int) {
        require(profileId in 1..100) { "Invalid profile ID." }
    }

    companion object {
        private const val PAGE_SIZE = 500
        private const val MAX_PAGE_SIZE = 500
        private const val MAX_SNAPSHOT_OFFSET = 1_000_000
        private const val MAX_REQUEST_BODY_BYTES = 192 * 1024
        private const val MAX_RESPONSE_BODY_BYTES = 2 * 1024 * 1024
    }
}

@Serializable
private data class ProgressWireEntry(
    @SerialName("content_id") val contentId: String,
    @SerialName("content_type") val contentType: String,
    @SerialName("video_id") val videoId: String,
    val season: Int? = null,
    val episode: Int? = null,
    val position: Long = 0L,
    val duration: Long = 0L,
    @SerialName("last_watched") val lastWatched: Long = 0L,
    @SerialName("progress_key") val progressKey: String,
) {
    fun toSyncRecord() = ProgressSyncRecord(
        contentId = contentId,
        contentType = contentType,
        videoId = videoId,
        season = season,
        episode = episode,
        position = position,
        duration = duration,
        lastWatched = lastWatched,
        progressKey = progressKey,
    )
}

@Serializable
private data class ProgressDeltaWireEntry(
    @SerialName("event_id") val eventId: Long,
    val operation: String,
    @SerialName("progress_key") val progressKey: String,
    @SerialName("content_id") val contentId: String = "",
    @SerialName("content_type") val contentType: String = "",
    @SerialName("video_id") val videoId: String = "",
    val season: Int? = null,
    val episode: Int? = null,
    val position: Long = 0L,
    val duration: Long = 0L,
    @SerialName("last_watched") val lastWatched: Long = 0L,
)

@Serializable
private data class ProgressPushRequest(
    val entries: List<ProgressWireEntry>,
    @SerialName("p_origin_client_id") val pOriginClientId: String,
)

@Serializable
private data class ProgressDeleteRequest(
    val keys: List<String>,
    @SerialName("p_origin_client_id") val pOriginClientId: String,
)

private fun WatchProgressEntry.toWireEntry() = ProgressWireEntry(
    contentId = parentMetaId,
    contentType = contentType,
    videoId = videoId,
    season = seasonNumber,
    episode = episodeNumber,
    position = lastPositionMs,
    duration = durationMs,
    lastWatched = lastUpdatedEpochMs,
    progressKey = resolvedProgressKey(),
)

/** Production-configured staged adapter; not wired into WatchProgressRepository yet. */
object CloudflareProgressSyncAdapter : ProgressSyncAdapter by CloudflareProgressSyncHttpAdapter(
    baseUrl = CloudflareWorkerConfig.BASE_URL,
    tokenProvider = { FirebaseAuthRepository.getFreshIdToken() },
    httpClient = createApiHttpClient(),
)
