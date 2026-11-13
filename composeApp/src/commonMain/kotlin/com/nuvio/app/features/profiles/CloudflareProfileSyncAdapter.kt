package com.nuvio.app.features.profiles

import com.nuvio.app.core.auth.FirebaseAuthRepository
import com.nuvio.app.core.network.CloudflareWorkerConfig
import com.nuvio.app.core.network.createApiHttpClient
import com.nuvio.app.core.network.readBoundedResponseBody
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
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.json.Json

/**
 * Staged Worker-backed profile metadata adapter.
 *
 * It is deliberately not wired into ProfileRepository while active authentication
 * and the rest of account/profile operations still depend on Supabase.
 */
internal class CloudflareProfileHttpAdapter(
    private val baseUrl: String,
    private val tokenProvider: suspend () -> String?,
    private val httpClient: HttpClient,
) {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    suspend fun pullProfiles(): List<NuvioProfile> =
        json.decodeFromString(execute(HttpMethod.Get, "/v1/profiles"))

    suspend fun pushProfiles(profiles: List<ProfilePushPayload>) {
        require(profiles.size <= MAX_PROFILES) { "No more than $MAX_PROFILES profiles can be saved." }
        require(profiles.map { it.profileIndex }.distinct().size == profiles.size) {
            "Profile indexes must be unique."
        }
        execute(
            HttpMethod.Put,
            "/v1/profiles",
            json.encodeToString(ProfilePushRequest(profiles)),
        )
    }

    suspend fun deleteProfile(profileIndex: Int) {
        requireProfile(profileIndex)
        execute(HttpMethod.Delete, "/v1/profiles/$profileIndex")
    }

    private suspend fun execute(method: HttpMethod, path: String, body: String? = null): String {
        val root = baseUrl.trim().trimEnd('/')
        if (!root.startsWith("https://", ignoreCase = true)) {
            throw IOException("Cloudflare Worker URL is not configured with HTTPS.")
        }
        val token = tokenProvider()?.takeIf(String::isNotBlank)
            ?: throw IOException("A signed-in Firebase account is required for profile sync.")
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
            throw IOException("Cloudflare profile API request failed (HTTP ${response.status.value}).")
        }
        return responseBody
    }

    private fun requireProfile(profileIndex: Int) {
        require(profileIndex in 1..MAX_PROFILES) { "Invalid profile index." }
    }

    companion object {
        private const val MAX_RESPONSE_BODY_BYTES = 2 * 1024 * 1024
    }
}

@Serializable
private data class ProfilePushRequest(
    val profiles: List<ProfilePushPayload>,
)

/** Production-configured staged adapter; not wired into ProfileRepository yet. */
internal val CloudflareProfileSyncAdapter = CloudflareProfileHttpAdapter(
    baseUrl = CloudflareWorkerConfig.BASE_URL,
    tokenProvider = { FirebaseAuthRepository.getFreshIdToken() },
    httpClient = createApiHttpClient(),
)
