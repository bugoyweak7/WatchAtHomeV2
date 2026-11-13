package com.nuvio.app.core.sync

import com.nuvio.app.core.auth.FirebaseAuthRepository
import com.nuvio.app.core.network.CloudflareWorkerConfig
import com.nuvio.app.core.network.createApiHttpClient
import com.nuvio.app.core.network.readBoundedResponseBody
import com.nuvio.app.features.profiles.ProfileRepository
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
import kotlinx.serialization.json.JsonObject

/**
 * Staged Cloudflare profile-settings blob adapter.
 *
 * ProfileSettingsSync remains on Supabase until Firebase is the active app session
 * and all profile-related remote operations have passed end-to-end verification.
 */
internal class CloudflareProfileSettingsHttpAdapter(
    private val baseUrl: String,
    private val tokenProvider: suspend () -> String?,
    private val httpClient: HttpClient,
) {
    private val json = Json {
        ignoreUnknownKeys = true
        encodeDefaults = true
    }

    suspend fun pull(profileId: Int, platform: String = MOBILE_SYNC_PLATFORM): JsonObject? {
        requireProfile(profileId)
        requirePlatform(platform)
        val response = execute(
            HttpMethod.Get,
            settingsPath(profileId, platform),
        )
        return json.decodeFromString<List<ProfileSettingsResponse>>(response)
            .firstOrNull()
            ?.settingsJson
    }

    suspend fun push(
        profileId: Int,
        settings: JsonObject,
        platform: String = MOBILE_SYNC_PLATFORM,
    ) {
        requireProfile(profileId)
        requirePlatform(platform)
        execute(
            HttpMethod.Put,
            settingsPath(profileId, platform),
            json.encodeToString(ProfileSettingsPushRequest(settings)),
        )
    }

    private suspend fun execute(method: HttpMethod, path: String, body: String? = null): String {
        val root = baseUrl.trim().trimEnd('/')
        if (!root.startsWith("https://", ignoreCase = true)) {
            throw IOException("Cloudflare Worker URL is not configured with HTTPS.")
        }
        val token = tokenProvider()?.takeIf(String::isNotBlank)
            ?: throw IOException("A signed-in Firebase account is required for profile settings sync.")
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
            throw IOException("Cloudflare profile settings API request failed (HTTP ${response.status.value}).")
        }
        return responseBody
    }

    private fun settingsPath(profileId: Int, platform: String) =
        "/v1/profiles/$profileId/settings?platform=$platform"

    private fun requireProfile(profileId: Int) {
        require(profileId in 1..6) { "Invalid profile index." }
    }

    private fun requirePlatform(platform: String) {
        require(platform.matches(Regex("[a-z0-9_-]{1,40}"))) { "Invalid settings platform." }
    }

    companion object {
        private const val MAX_RESPONSE_BODY_BYTES = 2 * 1024 * 1024
    }
}

@Serializable
private data class ProfileSettingsResponse(
    @SerialName("profile_id") val profileId: Int,
    val platform: String,
    @SerialName("settings_json") val settingsJson: JsonObject,
)

@Serializable
private data class ProfileSettingsPushRequest(
    @SerialName("settings_json") val settingsJson: JsonObject,
)

/** Production-configured staged adapter; not wired into ProfileSettingsSync yet. */
internal val CloudflareProfileSettingsSyncAdapter = CloudflareProfileSettingsHttpAdapter(
    baseUrl = CloudflareWorkerConfig.BASE_URL,
    tokenProvider = { FirebaseAuthRepository.getFreshIdToken() },
    httpClient = createApiHttpClient(),
)
