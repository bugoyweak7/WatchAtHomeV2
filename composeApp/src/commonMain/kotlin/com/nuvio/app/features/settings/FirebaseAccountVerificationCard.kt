package com.nuvio.app.features.settings

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.material3.Button
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.unit.dp
import com.nuvio.app.core.auth.AuthState
import com.nuvio.app.core.auth.FirebaseAuthRepository
import kotlinx.coroutines.launch

/**
 * Preview-stage Firebase email verification UI.
 *
 * This prepares a separate Firebase identity only. It does not link it to the
 * active Supabase account, change the active login provider, or call the Worker.
 */
@Composable
internal fun FirebaseAccountVerificationCard(
    legacyEmail: String?,
) {
    val firebaseState by FirebaseAuthRepository.state.collectAsState()
    val emailVerified by FirebaseAuthRepository.emailVerified.collectAsState()
    val scope = rememberCoroutineScope()
    var email by rememberSaveable { mutableStateOf(legacyEmail.orEmpty()) }
    var password by rememberSaveable { mutableStateOf("") }
    var isSignUp by rememberSaveable { mutableStateOf(true) }
    var isWorking by remember { mutableStateOf(false) }
    var feedback by remember { mutableStateOf<String?>(null) }
    var feedbackIsError by remember { mutableStateOf(false) }

    LaunchedEffect(Unit) {
        FirebaseAuthRepository.initialize()
    }

    fun runAuth(action: suspend () -> Result<Unit>) {
        if (isWorking) return
        isWorking = true
        feedback = null
        scope.launch {
            val result = action()
            isWorking = false
            feedbackIsError = result.isFailure
            feedback = result.exceptionOrNull()?.message
                ?: if (result.isSuccess) {
                    "Firebase account signed in. Check your inbox for the verification email."
                } else {
                    "Firebase authentication failed."
                }
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
        Text(
            text = "Prepare Firebase account",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold,
        )
        Text(
            text = "This is a separate migration-preparation step. Your current Supabase login and app data remain active. This does not link accounts or switch your login.",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
        )

        when (val state = firebaseState) {
            is AuthState.Authenticated -> {
                Text(
                    text = "Firebase account: ${state.email ?: "Email unavailable"}",
                    style = MaterialTheme.typography.bodyMedium,
                )
                val verified = emailVerified == true
                Text(
                    text = if (verified) "Email verification: Verified" else "Email verification: Not verified",
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (verified) MaterialTheme.colorScheme.primary
                    else MaterialTheme.colorScheme.onSurfaceVariant,
                )
                if (!verified) {
                    Button(
                        onClick = {
                            isWorking = true
                            feedback = null
                            scope.launch {
                                val result = FirebaseAuthRepository.sendEmailVerification()
                                isWorking = false
                                feedbackIsError = result.isFailure
                                feedback = result.exceptionOrNull()?.message
                                    ?: "Verification email sent. Check your inbox and spam folder."
                            }
                        },
                        enabled = !isWorking,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(if (isWorking) "Please wait…" else "Resend verification email")
                    }
                    OutlinedButton(
                        onClick = {
                            isWorking = true
                            feedback = null
                            scope.launch {
                                val result = FirebaseAuthRepository.reloadEmailVerificationStatus()
                                isWorking = false
                                feedbackIsError = result.isFailure
                                feedback = when {
                                    result.isFailure -> result.exceptionOrNull()?.message
                                        ?: "Could not refresh verification status."
                                    result.getOrNull() == true -> "Email successfully verified."
                                    else -> "Not verified yet. Open the email link, then check again."
                                }
                            }
                        },
                        enabled = !isWorking,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text("I've verified my email — check status")
                    }
                } else {
                    Text(
                        text = "Firebase email is verified. Account linking and backend bootstrap are separate steps and have not been performed.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                    )
                }
            }
            else -> {
                Text(
                    text = if (isSignUp) "Create a Firebase account" else "Sign in to an existing Firebase account",
                    style = MaterialTheme.typography.bodyMedium,
                )
                OutlinedTextField(
                    value = email,
                    onValueChange = { email = it },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !isWorking,
                    singleLine = true,
                    label = { Text("Firebase email") },
                )
                OutlinedTextField(
                    value = password,
                    onValueChange = { password = it },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = !isWorking,
                    singleLine = true,
                    visualTransformation = PasswordVisualTransformation(),
                    label = { Text("Firebase password") },
                )
                Button(
                    onClick = {
                        runAuth {
                            if (isSignUp) FirebaseAuthRepository.signUpWithEmail(email, password)
                            else FirebaseAuthRepository.signInWithEmail(email, password)
                        }
                    },
                    enabled = !isWorking && email.isNotBlank() && password.isNotEmpty(),
                    modifier = Modifier.fillMaxWidth(),
                ) {
                    Text(
                        when {
                            isWorking -> "Please wait…"
                            isSignUp -> "Create Firebase account and send verification"
                            else -> "Sign in to Firebase"
                        },
                    )
                }
                TextButton(
                    onClick = {
                        isSignUp = !isSignUp
                        feedback = null
                    },
                    enabled = !isWorking,
                ) {
                    Text(if (isSignUp) "Already have a Firebase account? Sign in" else "Need a Firebase account? Create one")
                }
            }
        }

        feedback?.let {
            Text(
                text = it,
                style = MaterialTheme.typography.bodySmall,
                color = if (feedbackIsError) MaterialTheme.colorScheme.error
                else MaterialTheme.colorScheme.onSurfaceVariant,
            )
        }
        Spacer(modifier = Modifier.height(2.dp))
    }
}
