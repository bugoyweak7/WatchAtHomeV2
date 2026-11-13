package com.nuvio.app.features.profiles

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.*
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import io.ktor.utils.io.errors.IOException
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class CloudflareProfileSyncAdapterTest {
    @Test
    fun pullProfilesUsesFirebaseBearerTokenAndWorkerRoute() = runBlocking {
        var requestedUrl = ""
        var authorization = ""
        val client = HttpClient(MockEngine { request ->
            requestedUrl = request.url.toString()
            authorization = request.headers[HttpHeaders.Authorization].orEmpty()
            respond(
                """[{"id":"profile-1","user_id":"firebase-user","profile_index":1,"name":"Main","avatar_color_hex":"#1E88E5","pin_enabled":false}]""",
                HttpStatusCode.OK,
            )
        })
        val adapter = CloudflareProfileHttpAdapter(
            baseUrl = "https://worker.example",
            tokenProvider = { "firebase-token" },
            httpClient = client,
        )

        val profiles = adapter.pullProfiles()

        assertEquals("https://worker.example/v1/profiles", requestedUrl)
        assertEquals("Bearer firebase-token", authorization)
        assertEquals(1, profiles.size)
        assertEquals(1, profiles.single().profileIndex)
        assertEquals("Main", profiles.single().name)
        client.close()
    }

    @Test
    fun pushProfilesSendsWorkerCompatibleProfileArray() = runBlocking {
        var method: HttpMethod? = null
        var requestedUrl = ""
        var requestBody = ""
        val client = HttpClient(MockEngine { request ->
            method = request.method
            requestedUrl = request.url.toString()
            requestBody = (request.body as TextContent).text
            respond("""{"saved":1}""", HttpStatusCode.OK)
        })
        val adapter = CloudflareProfileHttpAdapter(
            baseUrl = "https://worker.example/",
            tokenProvider = { "token" },
            httpClient = client,
        )

        adapter.pushProfiles(
            listOf(
                ProfilePushPayload(
                    profileIndex = 2,
                    name = "Kids",
                    avatarColorHex = "#43A047",
                    usesPrimaryAddons = true,
                ),
            ),
        )

        assertEquals(HttpMethod.Put, method)
        assertEquals("https://worker.example/v1/profiles", requestedUrl)
        assertTrue(requestBody.contains("\"profiles\""))
        assertTrue(requestBody.contains("\"profile_index\":2"))
        assertTrue(requestBody.contains("\"uses_primary_addons\":true"))
        client.close()
    }

    @Test
    fun deleteProfileUsesProfileScopedDeleteRoute() = runBlocking {
        var method: HttpMethod? = null
        var requestedUrl = ""
        val client = HttpClient(MockEngine { request ->
            method = request.method
            requestedUrl = request.url.toString()
            respond("""{"deleted":true}""", HttpStatusCode.OK)
        })
        val adapter = CloudflareProfileHttpAdapter(
            baseUrl = "https://worker.example",
            tokenProvider = { "token" },
            httpClient = client,
        )

        adapter.deleteProfile(3)

        assertEquals(HttpMethod.Delete, method)
        assertEquals("https://worker.example/v1/profiles/3", requestedUrl)
        client.close()
    }

    @Test
    fun missingFirebaseTokenPreventsNetworkRequest() = runBlocking {
        var requestCount = 0
        val client = HttpClient(MockEngine {
            requestCount++
            respond("[]", HttpStatusCode.OK)
        })
        val adapter = CloudflareProfileHttpAdapter(
            baseUrl = "https://worker.example",
            tokenProvider = { null },
            httpClient = client,
        )

        assertFailsWith<IOException> { adapter.pullProfiles() }
        assertEquals(0, requestCount)
        client.close()
    }
}
