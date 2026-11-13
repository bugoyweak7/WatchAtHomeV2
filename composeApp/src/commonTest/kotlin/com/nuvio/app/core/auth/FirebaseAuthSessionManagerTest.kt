package com.nuvio.app.core.auth

import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNull
import kotlin.test.assertTrue

@OptIn(ExperimentalCoroutinesApi::class)
class FirebaseAuthSessionManagerTest {
    private class FakeFirebaseAuthGateway : FirebaseAuthGateway {
        override val authState = MutableStateFlow<FirebaseAccountSnapshot?>(null)
        var signedOut = false
        var token: String? = "fresh-test-token"

        override suspend fun createAccount(email: String, password: String): FirebaseAccountSnapshot =
            FirebaseAccountSnapshot("new-user", email, isAnonymous = false).also {
                authState.value = it
            }

        override suspend fun signIn(email: String, password: String): FirebaseAccountSnapshot =
            FirebaseAccountSnapshot("existing-user", email, isAnonymous = false).also {
                authState.value = it
            }

        override suspend fun signOut() {
            signedOut = true
            authState.value = null
        }

        override suspend fun getIdToken(forceRefresh: Boolean): String? = token
    }

    @Test
    fun initializationRestoresRegisteredFirebaseAccountState() = runTest {
        val gateway = FakeFirebaseAuthGateway()
        gateway.authState.value = FirebaseAccountSnapshot("user-1", "user@example.com", false)
        val manager = FirebaseAuthSessionManager(gateway, backgroundScope)

        manager.initialize()
        runCurrent()

        val state = manager.state.value as AuthState.Authenticated
        assertEquals("user-1", state.userId)
        assertEquals("user@example.com", state.email)
        assertFalse(state.isAnonymous)
    }

    @Test
    fun anonymousFirebaseSessionIsRejectedAndSignedOut() = runTest {
        val gateway = FakeFirebaseAuthGateway()
        gateway.authState.value = FirebaseAccountSnapshot("anonymous-user", null, true)
        val manager = FirebaseAuthSessionManager(gateway, backgroundScope)

        manager.initialize()
        runCurrent()

        assertTrue(gateway.signedOut)
        assertEquals(AuthState.Unauthenticated, manager.state.value)
    }

    @Test
    fun emailRegistrationAndSignInUpdateAuthenticatedState() = runTest {
        val gateway = FakeFirebaseAuthGateway()
        val manager = FirebaseAuthSessionManager(gateway, backgroundScope)
        manager.initialize()
        runCurrent()

        assertTrue(manager.signUpWithEmail(" new@example.com ", "password123").isSuccess)
        assertEquals("new-user", (manager.state.value as AuthState.Authenticated).userId)

        assertTrue(manager.signInWithEmail("existing@example.com", "password123").isSuccess)
        assertEquals("existing-user", (manager.state.value as AuthState.Authenticated).userId)
    }

    @Test
    fun emptyEmailOrPasswordIsRejectedWithoutCallingFirebase() = runTest {
        val gateway = FakeFirebaseAuthGateway()
        val manager = FirebaseAuthSessionManager(gateway, backgroundScope)

        assertTrue(manager.signInWithEmail(" ", "password123").isFailure)
        assertTrue(manager.signInWithEmail("user@example.com", "").isFailure)
        assertNull(manager.state.value.userId)
    }

    @Test
    fun freshIdTokenIsExposedOnlyForARegisteredAccount() = runTest {
        val gateway = FakeFirebaseAuthGateway()
        val manager = FirebaseAuthSessionManager(gateway, backgroundScope)
        manager.initialize()
        runCurrent()

        assertNull(manager.getFreshIdToken())
        manager.signInWithEmail("user@example.com", "password123")
        assertEquals("fresh-test-token", manager.getFreshIdToken())
    }

    @Test
    fun signOutClearsTheStagedFirebaseSessionState() = runTest {
        val gateway = FakeFirebaseAuthGateway()
        val manager = FirebaseAuthSessionManager(gateway, backgroundScope)
        manager.initialize()
        runCurrent()
        manager.signInWithEmail("user@example.com", "password123")

        assertTrue(manager.signOut().isSuccess)
        assertEquals(AuthState.Unauthenticated, manager.state.value)
        assertTrue(gateway.signedOut)
    }
}
