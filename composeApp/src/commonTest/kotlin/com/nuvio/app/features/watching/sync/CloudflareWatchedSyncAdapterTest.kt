package com.nuvio.app.features.watching.sync

import com.nuvio.app.features.watched.WatchedItem
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

class CloudflareWatchedSyncAdapterTest {
    @Test
    fun snapshotUsesBoundedWorkerPagesAndMapsWatchedItems() = runBlocking {
        val requestedUrls = mutableListOf<String>()
        val client = HttpClient(MockEngine { request ->
            requestedUrls += request.url.toString()
            val offset = request.url.parameters["offset"]?.toInt() ?: 0
            val body = if (offset == 0) {
                """[{"content_id":"movie-1","content_type":"movie","title":"Film One","watched_at":1700000000000}]"""
            } else {
                """[]"""
            }
            respond(body, HttpStatusCode.OK)
        })
        val adapter = CloudflareWatchedSyncHttpAdapter(
            baseUrl = "https://worker.example/",
            tokenProvider = { "firebase-token" },
            httpClient = client,
        )

        val items = adapter.pull(profileId = 4, pageSize = 900)

        assertEquals(1, items.size)
        assertEquals("movie-1", items.single().id)
        assertEquals("Film One", items.single().name)
        assertEquals(
            listOf(
                "https://worker.example/v1/profiles/4/watched-items?limit=500&offset=0",
            ),
            requestedUrls,
        )
        client.close()
    }

    @Test
    fun deltaMapsUpsertAndDeleteEvents() = runBlocking {
        var requestedUrl = ""
        val client = HttpClient(MockEngine { request ->
            requestedUrl = request.url.toString()
            respond(
                """[{"event_id":19,"operation":"delete","content_id":"series-1","content_type":"series","title":"Series One","season":2,"episode":3,"watched_at":1700000000000}]""",
                HttpStatusCode.OK,
            )
        })
        val adapter = CloudflareWatchedSyncHttpAdapter(
            baseUrl = "https://worker.example",
            tokenProvider = { "token" },
            httpClient = client,
        )

        val events = adapter.pullDelta(profileId = 2, sinceEventId = 18, limit = 100)

        assertEquals("https://worker.example/v1/profiles/2/watched-items/delta?since=18&limit=100", requestedUrl)
        assertEquals(19L, events.single().eventId)
        assertEquals("delete", events.single().operation)
        assertEquals("series-1", events.single().contentId)
        assertEquals(2, events.single().season)
        client.close()
    }

    @Test
    fun cursorPushAndDeleteUseWorkerEndpointsAndWireFields() = runBlocking {
        val calls = mutableListOf<Pair<HttpMethod, String>>()
        val client = HttpClient(MockEngine { request ->
            calls += request.method to request.url.toString()
            respond("7", HttpStatusCode.OK)
        })
        val adapter = CloudflareWatchedSyncHttpAdapter(
            baseUrl = "https://worker.example",
            tokenProvider = { "token" },
            httpClient = client,
        )
        val item = WatchedItem(
            id = "series-1",
            type = "series",
            name = "Series One",
            season = 2,
            episode = 3,
            markedAtEpochMs = 1700000000000,
        )

        assertEquals(7L, adapter.getDeltaCursor(1))
        adapter.push(1, listOf(item))
        adapter.delete(1, listOf(item))

        assertEquals(HttpMethod.Get to "https://worker.example/v1/profiles/1/watched-items/cursor", calls[0])
        assertEquals(HttpMethod.Put to "https://worker.example/v1/profiles/1/watched-items", calls[1])
        assertEquals(HttpMethod.Post to "https://worker.example/v1/profiles/1/watched-items/delete", calls[2])
        client.close()
    }

    @Test
    fun missingFirebaseTokenBlocksRequest() = runBlocking {
        var requestCount = 0
        val client = HttpClient(MockEngine {
            requestCount++
            respond("0", HttpStatusCode.OK)
        })
        val adapter = CloudflareWatchedSyncHttpAdapter(
            baseUrl = "https://worker.example",
            tokenProvider = { null },
            httpClient = client,
        )

        assertFailsWith<IOException> { adapter.getDeltaCursor(1) }
        assertEquals(0, requestCount)
        client.close()
    }
}
