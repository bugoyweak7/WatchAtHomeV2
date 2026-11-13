package com.nuvio.app.features.library.sync

import com.nuvio.app.core.auth.FirebaseAuthRepository
import com.nuvio.app.core.network.CloudflareWorkerConfig
import com.nuvio.app.core.network.createApiHttpClient
import com.nuvio.app.core.network.readBoundedResponseBody
import com.nuvio.app.core.sync.SyncClientIdentity
import com.nuvio.app.features.library.LibraryItem
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
 * Worker-backed library sync. LibraryRepository selects this adapter only when
 * CLOUDFLARE_SYNC_ENABLED is explicitly true and an HTTPS Worker URL is configured.
 * Keep the flag disabled until Firebase auth and production Worker/D1 are verified.
 */
internal class CloudflareLibrarySyncHttpAdapter(
    private val baseUrl: String,
    private val tokenProvider: suspend () -> String?,
    private val httpClient: HttpClient,
) : LibrarySyncAdapter {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    override suspend fun pullSnapshot(profileId: Int, pageSize: Int): List<LibraryItem> {
        requireProfile(profileId)
        require(pageSize in 1..500) { "Invalid library page size." }
        return collectOffsetPages(pageSize) { limit, offset ->
            val body = execute(
                HttpMethod.Get,
                profilePath(profileId) + "/library?limit=$limit&offset=$offset",
            )
            json.decodeFromString<List<LibrarySyncItem>>(body).map(LibrarySyncItem::toLibraryItem)
        }
    }

    override suspend fun getDeltaCursor(profileId: Int): Long {
        requireProfile(profileId)
        return json.decodeFromString(
            execute(HttpMethod.Get, profilePath(profileId) + "/library/cursor"),
        )
    }

    override suspend fun pullDelta(
        profileId: Int,
        sinceEventId: Long,
        limit: Int,
    ): List<LibraryDeltaEvent> {
        requireProfile(profileId)
        require(sinceEventId >= 0 && limit in 1..500) { "Invalid library delta page." }
        val body = execute(
            HttpMethod.Get,
            profilePath(profileId) + "/library/delta?since=$sinceEventId&limit=$limit",
        )
        return json.decodeFromString<List<LibraryDeltaSyncItem>>(body).map { event ->
            LibraryDeltaEvent(
                eventId = event.eventId,
                operation = event.operation,
                item = event.toLibraryItem(),
            )
        }
    }

    override suspend fun pushItems(profileId: Int, items: Collection<LibraryItem>) {
        requireProfile(profileId)
        sendBatches(
            path = profilePath(profileId) + "/library",
            method = HttpMethod.Put,
            values = items.toList(),
        ) { batch ->
            json.encodeToString(
                LibraryPushRequest(
                    items = batch.map(LibraryItem::toSyncItem),
                    pOriginClientId = SyncClientIdentity.currentClientId(),
                ),
            )
        }
    }

    override suspend fun deleteItems(profileId: Int, keys: Collection<LibrarySyncKey>) {
        requireProfile(profileId)
        sendBatches(
            path = profilePath(profileId) + "/library/delete",
            method = HttpMethod.Post,
            values = keys.toList(),
        ) { batch ->
            json.encodeToString(
                LibraryDeleteRequest(
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
            val encodedCandidate = encode(candidate)
            if (encodedCandidate.encodeToByteArray().size > MAX_REQUEST_BODY_BYTES) {
                if (batch.isEmpty()) throw IOException("A library sync item exceeds the request size limit.")
                execute(method, path, encode(batch))
                batch = mutableListOf(value)
                if (encode(batch).encodeToByteArray().size > MAX_REQUEST_BODY_BYTES) {
                    throw IOException("A library sync item exceeds the request size limit.")
                }
            } else {
                batch = candidate.toMutableList()
            }
        }
        if (batch.isNotEmpty()) execute(method, path, encode(batch))
    }

    private suspend fun execute(
        method: HttpMethod,
        path: String,
        body: String? = null,
    ): String {
        val root = baseUrl.trim().trimEnd('/')
        if (!root.startsWith("https://", ignoreCase = true)) {
            throw IOException("Cloudflare Worker URL is not configured with HTTPS.")
        }
        val token = tokenProvider()?.takeIf(String::isNotBlank)
            ?: throw IOException("A signed-in Firebase account is required for library sync.")
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
            throw IOException("Cloudflare library API request failed (HTTP ${response.status.value}).")
        }
        return responseBody
    }

    private fun profilePath(profileId: Int) = "/v1/profiles/$profileId"

    private fun requireProfile(profileId: Int) {
        require(profileId in 1..100) { "Invalid profile ID." }
    }

    companion object {
        private const val MAX_REQUEST_BODY_BYTES = 192 * 1024
        private const val MAX_RESPONSE_BODY_BYTES = 2 * 1024 * 1024
    }
}

@Serializable
private data class LibraryPushRequest(
    val items: List<LibrarySyncItem>,
    @SerialName("p_origin_client_id") val pOriginClientId: String,
)

@Serializable
private data class LibraryDeleteRequest(
    val keys: List<LibrarySyncKey>,
    @SerialName("p_origin_client_id") val pOriginClientId: String,
)

/** Production-configured staged adapter; not wired into LibraryRepository yet. */
object CloudflareLibrarySyncAdapter : LibrarySyncAdapter by CloudflareLibrarySyncHttpAdapter(
    baseUrl = CloudflareWorkerConfig.BASE_URL,
    tokenProvider = { FirebaseAuthRepository.getFreshIdToken() },
    httpClient = createApiHttpClient(),
)
