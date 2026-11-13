package com.nuvio.app.core.sync

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.*
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.http.content.TextContent
import io.ktor.utils.io.errors.IOException
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertTrue

class CloudflareProfileSettingsSyncAdapterTest {
    @Test
    fun pullReadsMobileSettingsBlobFromWorker() = runBlocking {
        var requestedUrl = ""
        var authorization = ""
        val client = HttpClient(MockEngine { request ->
            requestedUrl = request.url.toString()
            authorization = request.headers[HttpHeaders.Authorization].orEmpty()
            respond(
                """[{"profile_id":2,"platform":"mobile","settings_json":{"version":4,"features":{"theme_settings":{"theme":"dark"}}}}]""",
                HttpStatusCode.OK,
            )
        })
        val adapter = CloudflareProfileSettingsHttpAdapter(
            baseUrl = "https://worker.example/",
            tokenProvider = { "firebase-token" },
            httpClient = client,
        )

        val settings = adapter.pull(2)

        assertEquals("https://worker.example/v1/profiles/2/settings?platform=mobile", requestedUrl)
        assertEquals("Bearer firebase-token", authorization)
        assertEquals("dark", settings?.get("features")?.jsonObject?.get("theme_settings")?.jsonObject?.get("theme").toString().trim('"'))
        client.close()
    }

    @Test
    fun pushUsesWorkerSettingsJsonContract() = runBlocking {
        var method: HttpMethod? = null
        var requestedUrl = ""
        var requestBody = ""
        val client = HttpClient(MockEngine { request ->
            method = request.method
            requestedUrl = request.url.toString()
            requestBody = (request.body as TextContent).text
            respond("""{"saved":true}""", HttpStatusCode.OK)
        })
        val adapter = CloudflareProfileSettingsHttpAdapter(
            baseUrl = "https://worker.example",
            tokenProvider = { "token" },
            httpClient = client,
        )
        val settings = Json.parseToJsonElement("""{"version":4,"features":{"unknown_future_key":true}}""").jsonObject

        adapter.push(profileId = 4, settings = settings)

        assertEquals(HttpMethod.Put, method)
        assertEquals("https://worker.example/v1/profiles/4/settings?platform=mobile", requestedUrl)
        assertTrue(requestBody.contains("\"settings_json\""))
        assertTrue(requestBody.contains("unknown_future_key"))
        client.close()
    }

    @Test
    fun missingFirebaseTokenPreventsWorkerRequest() = runBlocking {
        var requestCount = 0
        val client = HttpClient(MockEngine {
            requestCount++
            respond("[]", HttpStatusCode.OK)
        })
        val adapter = CloudflareProfileSettingsHttpAdapter(
            baseUrl = "https://worker.example",
            tokenProvider = { null },
            httpClient = client,
        )

        assertFailsWith<IOException> { adapter.pull(1) }
        assertEquals(0, requestCount)
        client.close()
    }
}
