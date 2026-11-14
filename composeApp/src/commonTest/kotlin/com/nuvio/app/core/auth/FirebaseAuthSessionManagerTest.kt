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
        var verificationEmailSent = 0
        var token: String? = "fresh-test-token"
        var currentAccount: FirebaseAccountSnapshot? = null

        override suspend fun createAccount(email: String, password: String): FirebaseAccountSnapshot =
            FirebaseAccountSnapshot("new-user", email, isAnonymous = false, isEmailVerified = false).also {
                currentAccount = it
                authState.value = it
            }

        override suspend fun signIn(email: String, password: String): FirebaseAccountSnapshot =
            (currentAccount ?: FirebaseAccountSnapshot(
                "existing-user", email, isAnonymous = false, isEmailVerified = false,
            )).also {
                currentAccount = it
                authState.value = it
            }

        override suspend fun sendEmailVerification() {
            check(currentAccount != null)
            verificationEmailSent += 1
        }

        override suspend fun reloadCurrentUser(): FirebaseAccountSnapshot? = currentAccount

        override suspend fun signOut() {
            signedOut = true
            currentAccount = null
            authState.value = null
        }

        override suspend fun getIdToken(forceRefresh: Boolean): String? = token
    }

    @Test
    fun initializationRestoresRegisteredFirebaseAccountState() = runTest {
        val gateway = FakeFirebaseAuthGateway()
        gateway.currentAccount = FirebaseAccountSnapshot("user-1", "user@example.com", false, true)
        gateway.authState.value = gateway.currentAccount
        val manager = FirebaseAuthSessionManager(gateway, backgroundScope)

        manager.initialize()
        runCurrent()

        val state = manager.state.value as AuthState.Authenticated
        assertEquals("user-1", state.userId)
        assertEquals("user@example.com", state.email)
        assertFalse(state.isAnonymous)
        assertEquals(true, manager.emailVerified.value)
    }

    @Test
    fun anonymousFirebaseSessionIsRejectedAndSignedOut() = runTest {
        val gateway = FakeFirebaseAuthGateway()
        gateway.authState.value = FirebaseAccountSnapshot("anonymous-user", null, true, false)
        val manager = FirebaseAuthSessionManager(gateway, backgroundScope)

        manager.initialize()
        runCurrent()

        assertTrue(gateway.signedOut)
        assertEquals(AuthState.Unauthenticated, manager.state.value)
        assertNull(manager.emailVerified.value)
    }

    @Test
    fun registrationSendsVerificationEmailAndTracksUnverifiedState() = runTest {
        val gateway = FakeFirebaseAuthGateway()
        val manager = FirebaseAuthSessionManager(gateway, backgroundScope)
        manager.initialize()
        runCurrent()

        assertTrue(manager.signUpWithEmail(" new@example.com ", "password123").isSuccess)
        assertEquals(1, gateway.verificationEmailSent)
        assertEquals(false, manager.emailVerified.value)
        assertEquals("new-user", (manager.state.value as AuthState.Authenticated).userId)
    }

    @Test
    fun verificationEmailCanBeResentUntilVerified() = runTest {
        val gateway = FakeFirebaseAuthGateway()
        val manager = FirebaseAuthSessionManager(gateway, backgroundScope)
        manager.initialize()
        runCurrent()
        manager.signUpWithEmail("new@example.com", "password123")

        assertTrue(manager.sendEmailVerification().isSuccess)
        assertEquals(2, gateway.verificationEmailSent)
    }

    @Test
    fun refreshedVerificationStatusIsReadFromReloadedFirebaseUser() = runTest {
        val gateway = FakeFirebaseAuthGateway()
        val manager = FirebaseAuthSessionManager(gateway, backgroundScope)
        manager.initialize()
        runCurrent()
        manager.signUpWithEmail("new@example.com", "password123")
        gateway.currentAccount = FirebaseAccountSnapshot(
            "new-user", "new@example.com", isAnonymous = false, isEmailVerified = true,
        )

        val result = manager.reloadEmailVerificationStatus()

        assertTrue(result.isSuccess)
        assertEquals(true, result.getOrNull())
        assertEquals(true, manager.emailVerified.value)
    }

    @Test
    fun verificationReloadRejectsMissingOrMismatchedSession() = runTest {
        val gateway = FakeFirebaseAuthGateway()
        val manager = FirebaseAuthSessionManager(gateway, backgroundScope)
        assertTrue(manager.reloadEmailVerificationStatus().isFailure)

        manager.initialize()
        runCurrent()
        manager.signUpWithEmail("new@example.com", "password123")
        gateway.currentAccount = FirebaseAccountSnapshot(
            "different-user", "new@example.com", isAnonymous = false, isEmailVerified = true,
        )
        assertTrue(manager.reloadEmailVerificationStatus().isFailure)
        assertEquals(false, manager.emailVerified.value)
    }

    @Test
    fun emptyEmailOrPasswordIsRejectedWithoutCallingFirebase() = runTest {
        val gateway = FakeFirebaseAuthGateway()
        val manager = FirebaseAuthSessionManager(gateway, backgroundScope)

        assertTrue(manager.signInWithEmail(" ", "password123").isFailure)
        assertTrue(manager.signInWithEmail("user@example.com", "").isFailure)
        assertNull(manager.state.value.userId)
        assertEquals(0, gateway.verificationEmailSent)
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
        assertNull(manager.emailVerified.value)
        assertTrue(gateway.signedOut)
    }
}
