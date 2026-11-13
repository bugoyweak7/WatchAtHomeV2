package com.nuvio.app.features.watching.sync

import io.ktor.client.HttpClient
import io.ktor.client.engine.mock.*
import io.ktor.http.HttpHeaders
import io.ktor.http.HttpMethod
import io.ktor.http.HttpStatusCode
import io.ktor.utils.io.errors.IOException
import kotlinx.coroutines.runBlocking
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class CloudflareProgressSyncAdapterTest {
    @Test
    fun snapshotUsesWorkerRouteAndMapsProgressIdentity() = runBlocking {
        var requestedUrl = ""
        var authorization = ""
        val client = HttpClient(MockEngine { request ->
            requestedUrl = request.url.toString()
            authorization = request.headers[HttpHeaders.Authorization].orEmpty()
            respond(
                """[{"content_id":"show-1","content_type":"series","video_id":"ep-2","season":1,"episode":2,"position":120000,"duration":240000,"last_watched":1700000000000,"progress_key":"show-1_s1e2"}]""",
                HttpStatusCode.OK,
            )
        })
        val adapter = CloudflareProgressSyncHttpAdapter(
            baseUrl = "https://worker.example/",
            tokenProvider = { "firebase-token" },
            httpClient = client,
        )

        val records = adapter.pull(profileId = 4, sinceLastWatched = 100L, limit = 20)

        assertEquals(1, records.size)
        assertEquals("show-1_s1e2", records.single().progressKey)
        assertEquals(120000L, records.single().position)
        assertEquals("https://worker.example/v1/profiles/4/watch-progress?limit=20&offset=0&sinceLastWatched=100", requestedUrl)
        assertEquals("Bearer firebase-token", authorization)
        client.close()
    }

    @Test
    fun deltaMapsDeleteTombstones() = runBlocking {
        var requestedUrl = ""
        val client = HttpClient(MockEngine { request ->
            requestedUrl = request.url.toString()
            respond(
                """[{"event_id":19,"operation":"delete","progress_key":"movie-1"}]""",
                HttpStatusCode.OK,
            )
        })
        val adapter = CloudflareProgressSyncHttpAdapter(
            baseUrl = "https://worker.example",
            tokenProvider = { "token" },
            httpClient = client,
        )

        val events = adapter.pullDelta(profileId = 2, sinceEventId = 18, limit = 100)

        assertEquals("https://worker.example/v1/profiles/2/watch-progress/delta?since=18&limit=100", requestedUrl)
        assertEquals(19L, events.single().eventId)
        assertEquals("delete", events.single().operation)
        assertEquals("movie-1", events.single().progressKey)
        client.close()
    }

    @Test
    fun cursorAndMutationUseWorkerEndpoints() = runBlocking {
        val calls = mutableListOf<Pair<HttpMethod, String>>()
        val client = HttpClient(MockEngine { request ->
            calls += request.method to request.url.toString()
            respond("7", HttpStatusCode.OK)
        })
        val adapter = CloudflareProgressSyncHttpAdapter(
            baseUrl = "https://worker.example",
            tokenProvider = { "token" },
            httpClient = client,
        )

        assertEquals(7L, adapter.getDeltaCursor(1))
        adapter.delete(1, emptyList())

        assertEquals(HttpMethod.Get to "https://worker.example/v1/profiles/1/watch-progress/cursor", calls[0])
        assertEquals(1, calls.size)
        client.close()
    }

    @Test
    fun missingFirebaseTokenBlocksRequest() = runBlocking {
        var requestCount = 0
        val client = HttpClient(MockEngine {
            requestCount++
            respond("0", HttpStatusCode.OK)
        })
        val adapter = CloudflareProgressSyncHttpAdapter(
            baseUrl = "https://worker.example",
            tokenProvider = { null },
            httpClient = client,
        )

        assertFailsWith<IOException> { adapter.getDeltaCursor(1) }
        assertEquals(0, requestCount)
        client.close()
    }
}
