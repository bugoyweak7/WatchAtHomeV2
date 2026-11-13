package com.nuvio.app.features.library.sync

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.*
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpStatusCode
import io.ktor.utils.io.errors.IOException
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class CloudflareLibrarySyncAdapterTest {
    @Test
    fun cursorRequestUsesFirebaseBearerTokenAndWorkerRoute() = runBlocking {
        var requestedUrl = ""
        var authorization = ""
        val client = HttpClient(MockEngine { request ->
            requestedUrl = request.url.toString()
            authorization = request.headers[HttpHeaders.Authorization].orEmpty()
            respond("27", HttpStatusCode.OK)
        })
        val adapter = CloudflareLibrarySyncHttpAdapter(
            baseUrl = "https://worker.example",
            tokenProvider = { "firebase-test-token" },
            httpClient = client,
        )

        assertEquals(27L, adapter.getDeltaCursor(3))
        assertEquals("https://worker.example/v1/profiles/3/library/cursor", requestedUrl)
        assertEquals("Bearer firebase-test-token", authorization)
        client.close()
    }

    @Test
    fun snapshotMapsWorkerWireFieldsToLibraryItems() = runBlocking {
        val client = HttpClient(MockEngine {
            respond(
                """[{"content_id":"movie-1","content_type":"movie","name":"Test Movie","poster_shape":"LANDSCAPE","added_at":1234}]""",
                HttpStatusCode.OK,
            )
        })
        val adapter = CloudflareLibrarySyncHttpAdapter(
            baseUrl = "https://worker.example/",
            tokenProvider = { "token" },
            httpClient = client,
        )

        val result = adapter.pullSnapshot(profileId = 2, pageSize = 50)

        assertEquals(1, result.size)
        assertEquals("movie-1", result.single().id)
        assertEquals("Test Movie", result.single().name)
        assertEquals(1234L, result.single().savedAtEpochMs)
        client.close()
    }

    @Test
    fun workerHttpErrorsAreNotTreatedAsSuccessfulSync() = runBlocking {
        val client = HttpClient(MockEngine {
            respond("""{"error":"Unauthorized"}""", HttpStatusCode.Unauthorized)
        })
        val adapter = CloudflareLibrarySyncHttpAdapter(
            baseUrl = "https://worker.example",
            tokenProvider = { "expired-token" },
            httpClient = client,
        )

        assertFailsWith<IOException> { adapter.getDeltaCursor(1) }
        client.close()
    }

    @Test
    fun missingFirebaseTokenPreventsWorkerRequest() = runBlocking {
        var requestCount = 0
        val client = HttpClient(MockEngine {
            requestCount++
            respond("0", HttpStatusCode.OK)
        })
        val adapter = CloudflareLibrarySyncHttpAdapter(
            baseUrl = "https://worker.example",
            tokenProvider = { null },
            httpClient = client,
        )

        assertFailsWith<IOException> { adapter.getDeltaCursor(1) }
        assertEquals(0, requestCount)
        client.close()
    }
}
