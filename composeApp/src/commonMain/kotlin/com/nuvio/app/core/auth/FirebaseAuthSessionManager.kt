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

/**
 * Staged Firebase email/password session manager.
 *
 * It intentionally does not replace AuthRepository yet. Existing profile, library,
 * sync, device-link and account-deletion operations still depend on Supabase and
 * must be migrated before the app can switch its active authentication provider.
 */
internal class FirebaseAuthSessionManager(
    private val gateway: FirebaseAuthGateway,
    private val scope: CoroutineScope,
) {
    private val _state = MutableStateFlow<AuthState>(AuthState.Loading)
    val state: StateFlow<AuthState> = _state.asStateFlow()

    private var initialized = false
    private var authStateJob: Job? = null

    fun initialize() {
        if (initialized) return
        initialized = true
        authStateJob = scope.launch {
            gateway.authState.collect { account ->
                if (account == null) {
                    _state.value = AuthState.Unauthenticated
                } else if (account.isAnonymous) {
                    // Anonymous Firebase sessions are not accepted by this app.
                    runCatching { gateway.signOut() }
                    _state.value = AuthState.Unauthenticated
                } else {
                    _state.value = account.toAuthState()
                }
            }
        }
    }

    suspend fun signUpWithEmail(email: String, password: String): Result<Unit> =
        authenticate(email, password) { normalizedEmail, suppliedPassword ->
            gateway.createAccount(normalizedEmail, suppliedPassword)
        }

    suspend fun signInWithEmail(email: String, password: String): Result<Unit> =
        authenticate(email, password) { normalizedEmail, suppliedPassword ->
            gateway.signIn(normalizedEmail, suppliedPassword)
        }

    suspend fun signOut(): Result<Unit> = runCatching {
        gateway.signOut()
        _state.value = AuthState.Unauthenticated
    }

    suspend fun getFreshIdToken(): String? {
        val account = _state.value as? AuthState.Authenticated ?: return null
        if (account.isAnonymous) return null
        return gateway.getIdToken(forceRefresh = true)?.takeIf(String::isNotBlank)
    }

    fun stop() {
        authStateJob?.cancel()
        authStateJob = null
        initialized = false
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
object FirebaseAuthRepository {
    private val manager = FirebaseAuthSessionManager(
        gateway = GitLiveFirebaseAuthGateway,
        scope = CoroutineScope(SupervisorJob() + Dispatchers.Default),
    )

    val state: StateFlow<AuthState> get() = manager.state

    fun initialize() = manager.initialize()

    suspend fun signUpWithEmail(email: String, password: String): Result<Unit> =
        manager.signUpWithEmail(email, password)

    suspend fun signInWithEmail(email: String, password: String): Result<Unit> =
        manager.signInWithEmail(email, password)

    suspend fun signOut(): Result<Unit> = manager.signOut()

    suspend fun getFreshIdToken(): String? = manager.getFreshIdToken()
}
