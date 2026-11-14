package com.nuvio.app.core.auth

import dev.gitlive.firebase.Firebase
import dev.gitlive.firebase.auth.FirebaseAuth
import dev.gitlive.firebase.auth.FirebaseUser
import dev.gitlive.firebase.auth.auth
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

internal data class FirebaseAccountSnapshot(
    val userId: String,
    val email: String?,
    val isAnonymous: Boolean,
    val isEmailVerified: Boolean,
)

internal interface FirebaseAuthGateway {
    val authState: Flow<FirebaseAccountSnapshot?>

    suspend fun createAccount(email: String, password: String): FirebaseAccountSnapshot
    suspend fun signIn(email: String, password: String): FirebaseAccountSnapshot
    suspend fun sendEmailVerification()
    suspend fun reloadCurrentUser(): FirebaseAccountSnapshot?
    suspend fun signOut()
    suspend fun getIdToken(forceRefresh: Boolean): String?
}

/**
 * Multiplatform Firebase Auth adapter.
 *
 * Android uses the default app created by the Google Services plugin.
 * iOS initializes the default app from the checked-in GoogleService-Info.plist.
 */
internal object GitLiveFirebaseAuthGateway : FirebaseAuthGateway {
    // Android initializes the default app through FirebaseInitProvider when
    // google-services.json is present. iOS initializes it in iOSApp.swift.
    // Avoid calling Firebase.initialize() here: the Android overload requires
    // an Application context, and the iOS app is already configured.
    private val auth: FirebaseAuth by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
        Firebase.auth
    }

    override val authState: Flow<FirebaseAccountSnapshot?> by lazy {
        auth.authStateChanged.map { user -> user?.toSnapshot() }
    }

    override suspend fun createAccount(
        email: String,
        password: String,
    ): FirebaseAccountSnapshot =
        requireNotNull(auth.createUserWithEmailAndPassword(email, password).user) {
            "Firebase did not return a user after registration."
        }.toSnapshot()

    override suspend fun signIn(
        email: String,
        password: String,
    ): FirebaseAccountSnapshot =
        requireNotNull(auth.signInWithEmailAndPassword(email, password).user) {
            "Firebase did not return a user after sign-in."
        }.toSnapshot()

    override suspend fun sendEmailVerification() {
        requireNotNull(auth.currentUser) {
            "Sign in to your Firebase account before requesting email verification."
        }.sendEmailVerification()
    }

    override suspend fun reloadCurrentUser(): FirebaseAccountSnapshot? {
        val user = auth.currentUser ?: return null
        user.reload()
        return auth.currentUser?.toSnapshot()
    }

    override suspend fun signOut() {
        auth.signOut()
    }

    override suspend fun getIdToken(forceRefresh: Boolean): String? =
        auth.currentUser?.getIdToken(forceRefresh)

    private fun FirebaseUser.toSnapshot() = FirebaseAccountSnapshot(
        userId = uid,
        email = email,
        isAnonymous = isAnonymous,
        isEmailVerified = isEmailVerified,
    )
}
