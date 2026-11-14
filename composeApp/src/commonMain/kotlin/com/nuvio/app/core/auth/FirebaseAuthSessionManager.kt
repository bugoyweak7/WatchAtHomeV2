package com.nuvio.app.core.auth

import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collect
import kotlinx.coroutines.launch
import com.nuvio.app.core.network.CloudflareWorkerConfig
import com.nuvio.app.core.network.createApiHttpClient
import io.ktor.client.request.post
import io.ktor.client.request.get
import io.ktor.client.request.header
import io.ktor.client.request.setBody
import io.ktor.client.statement.bodyAsText
import io.ktor.http.ContentType
import io.ktor.http.HttpHeaders
import io.ktor.http.contentType
import io.ktor.http.isSuccess
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.boolean
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long

/**
 * Staged Firebase email/password session manager.
 *
 * It intentionally does not replace AuthRepository yet. Existing profile, library,
 * sync, device-link and account-deletion operations still depend on Supabase and
 * must be migrated before the app can switch its active authentication provider.
 */
data class FirebaseTrialStatus(
    val initialized: Boolean,
    val trialStartedAt: String,
    val trialExpiresAt: String,
)


data class FirebaseCloudflareAccountStatus(
    val uid: String,
    val status: String,
    val createdAt: Long,
    val updatedAt: Long,
    val deletedAt: Long?,
)

internal fun parseFirebaseCloudflareAccountStatus(
    responseText: String,
    expectedUid: String,
): FirebaseCloudflareAccountStatus {
    val account = Json.parseToJsonElement(responseText).jsonObject["account"]?.jsonObject
        ?: error("Cloudflare did not return account details.")
    val uid = account["uid"]?.jsonPrimitive?.contentOrNull
        ?: error("Cloudflare account UID is missing.")
    check(uid == expectedUid) { "Cloudflare returned a different account." }
    val status = account["status"]?.jsonPrimitive?.contentOrNull
        ?: error("Cloudflare account status is missing.")
    check(status in setOf("active", "deletion_pending", "deleted")) {
        "Cloudflare returned an unsupported account status."
    }
    val createdAt = account["createdAt"]?.jsonPrimitive?.long
        ?: error("Cloudflare account creation timestamp is missing.")
    val updatedAt = account["updatedAt"]?.jsonPrimitive?.long
        ?: error("Cloudflare account update timestamp is missing.")
    val deletedValue = account["deletedAt"]
    val deletedAt = if (deletedValue == null || deletedValue.toString() == "null") {
        null
    } else {
        deletedValue.jsonPrimitive.long
    }
    check(createdAt >= 0 && updatedAt >= 0 && (deletedAt == null || deletedAt >= 0)) {
        "Cloudflare returned an invalid account timestamp."
    }
    return FirebaseCloudflareAccountStatus(uid, status, createdAt, updatedAt, deletedAt)
}

internal class FirebaseAuthSessionManager(
    private val gateway: FirebaseAuthGateway,
    private val scope: CoroutineScope,
) {
    private val _state = MutableStateFlow<AuthState>(AuthState.Loading)
    val state: StateFlow<AuthState> = _state.asStateFlow()

    private val _emailVerified = MutableStateFlow<Boolean?>(null)
    val emailVerified: StateFlow<Boolean?> = _emailVerified.asStateFlow()

    private var initialized = false
    private var authStateJob: Job? = null

    fun initialize() {
        if (initialized) return
        initialized = true
        authStateJob = scope.launch {
            gateway.authState.collect { account ->
                if (account == null) {
                    _emailVerified.value = null
                    _state.value = AuthState.Unauthenticated
                } else if (account.isAnonymous) {
                    // Anonymous Firebase sessions are not accepted by this app.
                    runCatching { gateway.signOut() }
                    _emailVerified.value = null
                    _state.value = AuthState.Unauthenticated
                } else {
                    _emailVerified.value = account.isEmailVerified
                    _state.value = account.toAuthState()
                }
            }
        }
    }

    /**
     * Creates a Firebase email/password account and sends its verification email.
     * If email delivery fails, the Firebase account remains created and the caller
     * can retry with [sendEmailVerification].
     */
    suspend fun signUpWithEmail(email: String, password: String): Result<Unit> =
        authenticate(email, password) { normalizedEmail, suppliedPassword ->
            val account = gateway.createAccount(normalizedEmail, suppliedPassword)
            _emailVerified.value = account.isEmailVerified
            gateway.sendEmailVerification()
            account
        }

    suspend fun signInWithEmail(email: String, password: String): Result<Unit> =
        authenticate(email, password) { normalizedEmail, suppliedPassword ->
            gateway.signIn(normalizedEmail, suppliedPassword).also {
                _emailVerified.value = it.isEmailVerified
            }
        }

    suspend fun sendEmailVerification(): Result<Unit> = runCatching {
        val account = _state.value as? AuthState.Authenticated
            ?: error("Sign in to your Firebase account first.")
        require(!account.isAnonymous) { "Anonymous accounts cannot verify an email address." }
        require(_emailVerified.value != true) { "This email address is already verified." }
        gateway.sendEmailVerification()
    }

    /**
     * Reloads the Firebase user from the server so a completed email-verification
     * link is reflected locally. Returns the refreshed verification status.
     */
    suspend fun reloadEmailVerificationStatus(): Result<Boolean> = runCatching {
        val account = _state.value as? AuthState.Authenticated
            ?: error("Sign in to your Firebase account first.")
        require(!account.isAnonymous) { "Anonymous accounts are not supported." }
        val refreshed = gateway.reloadCurrentUser()
            ?: error("The Firebase session is no longer available. Sign in again.")
        require(refreshed.userId == account.userId) {
            "The refreshed Firebase account does not match the signed-in account."
        }
        _emailVerified.value = refreshed.isEmailVerified
        _state.value = refreshed.toAuthState()
        refreshed.isEmailVerified
    }

    suspend fun signOut(): Result<Unit> = runCatching {
        gateway.signOut()
        _emailVerified.value = null
        _state.value = AuthState.Unauthenticated
    }

    suspend fun getFreshIdToken(): String? {
        val account = _state.value as? AuthState.Authenticated ?: return null
        if (account.isAnonymous) return null
        return gateway.getIdToken(forceRefresh = true)?.takeIf(String::isNotBlank)
    }

    /**
     * Initializes the Firebase UID on the configured Cloudflare Worker.
     * This is intentionally separate from the active app AuthRepository.
     */
    suspend fun bootstrapCloudflareAccount(): Result<FirebaseTrialStatus> = runCatching {
        require(_emailVerified.value == true) {
            "Verify your Firebase email address before continuing."
        }
        val baseUrl = CloudflareWorkerConfig.BASE_URL.trim().trimEnd('/')
        require(baseUrl.startsWith("https://", ignoreCase = true)) {
            "The secure Cloudflare Worker URL is not configured for this build."
        }
        val token = getFreshIdToken()
            ?: error("Your Firebase session expired. Sign in again.")

        val response = bootstrapHttpClient.post("$baseUrl/v1/account/bootstrap") {
            header(HttpHeaders.Authorization, "Bearer $token")
            contentType(ContentType.Application.Json)
            setBody("{}")
        }
        val responseText = response.bodyAsText()
        check(response.status.isSuccess()) {
            when (response.status.value) {
                401 -> "Firebase session was rejected. Sign in again."
                403 -> "This Firebase account is not eligible for bootstrap."
                503 -> "Cloudflare account storage is not ready. Try again later."
                else -> "Account setup failed. Please try again."
            }
        }
        val payload = Json.parseToJsonElement(responseText).jsonObject
        val accountReady = payload["accountReady"]?.jsonPrimitive?.boolean == true
        check(accountReady) { "Cloudflare did not confirm account setup." }
        val trial = payload["trial"]?.jsonObject
            ?: error("Cloudflare confirmed the account but did not return trial details.")
        val initialized = trial["initialized"]?.jsonPrimitive?.boolean == true
        val startedAt = trial["trialStartedAt"]?.jsonPrimitive?.contentOrNull.orEmpty()
        val expiresAt = trial["trialExpiresAt"]?.jsonPrimitive?.contentOrNull.orEmpty()
        check(initialized && startedAt.isNotBlank() && expiresAt.isNotBlank()) {
            "Cloudflare confirmed the account but trial dates could not be verified."
        }
        FirebaseTrialStatus(initialized, startedAt, expiresAt)
    }


    /**
     * Retrieves the signed-in Firebase user's account lifecycle status.
     * This GET request is read-only and remains separate from active Supabase auth.
     */
    suspend fun getCloudflareAccountStatus(): Result<FirebaseCloudflareAccountStatus> = runCatching {
        require(_emailVerified.value == true) {
            "Verify your Firebase email address before checking account status."
        }
        val account = _state.value as? AuthState.Authenticated
            ?: error("Sign in to your Firebase account first.")
        require(!account.isAnonymous) { "Anonymous accounts are not supported." }
        val baseUrl = CloudflareWorkerConfig.BASE_URL.trim().trimEnd('/')
        require(baseUrl.startsWith("https://", ignoreCase = true)) {
            "The secure Cloudflare Worker URL is not configured for this build."
        }
        val token = getFreshIdToken()
            ?: error("Your Firebase session expired. Sign in again.")
        val response = bootstrapHttpClient.get("$baseUrl/v1/account") {
            header(HttpHeaders.Authorization, "Bearer $token")
        }
        val responseText = response.bodyAsText()
        check(response.status.isSuccess()) {
            when (response.status.value) {
                401 -> "Firebase session was rejected. Sign in again."
                403 -> "This Firebase account is not active."
                404 -> "Cloudflare account setup has not been completed."
                503 -> "Cloudflare account storage is not ready. Try again later."
                else -> "Account status could not be loaded. Please try again."
            }
        }
        parseFirebaseCloudflareAccountStatus(responseText, account.userId)
    }

    fun stop() {
        authStateJob?.cancel()
        authStateJob = null
        initialized = false
        _emailVerified.value = null
        _state.value = AuthState.Loading
    }

    private suspend fun authenticate(
        email: String,
        password: String,
        operation: suspend (String, String) -> FirebaseAccountSnapshot,
    ): Result<Unit> = runCatching {
        val normalizedEmail = email.trim()
        require(normalizedEmail.isNotEmpty()) { "Enter your email address." }
        require(password.isNotEmpty()) { "Enter your password." }

        val account = operation(normalizedEmail, password)
        require(!account.isAnonymous) { "Anonymous accounts are not supported." }
        _emailVerified.value = account.isEmailVerified
        _state.value = account.toAuthState()
    }

    private fun FirebaseAccountSnapshot.toAuthState() = AuthState.Authenticated(
        userId = userId,
        email = email,
        isAnonymous = false,
    )
}

/**
 * Firebase authentication entry point for the future app cutover.
 *
 * This repository is deliberately not wired into AuthScreen while Supabase-backed
 * account data and feature APIs remain active.
 */
private val bootstrapHttpClient by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
    createApiHttpClient()
}

object FirebaseAuthRepository {
    private val manager = FirebaseAuthSessionManager(
        gateway = GitLiveFirebaseAuthGateway,
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
    )

    val state: StateFlow<AuthState> get() = manager.state
    val emailVerified: StateFlow<Boolean?> get() = manager.emailVerified

    fun initialize() = manager.initialize()

    suspend fun signUpWithEmail(email: String, password: String): Result<Unit> =
        manager.signUpWithEmail(email, password)

    suspend fun signInWithEmail(email: String, password: String): Result<Unit> =
        manager.signInWithEmail(email, password)

    suspend fun sendEmailVerification(): Result<Unit> =
        manager.sendEmailVerification()

    suspend fun reloadEmailVerificationStatus(): Result<Boolean> =
        manager.reloadEmailVerificationStatus()

    suspend fun signOut(): Result<Unit> = manager.signOut()

    suspend fun getFreshIdToken(): String? = manager.getFreshIdToken()

    suspend fun bootstrapCloudflareAccount(): Result<FirebaseTrialStatus> =
        manager.bootstrapCloudflareAccount()

    suspend fun getCloudflareAccountStatus(): Result<FirebaseCloudflareAccountStatus> =
        manager.getCloudflareAccountStatus()
}
