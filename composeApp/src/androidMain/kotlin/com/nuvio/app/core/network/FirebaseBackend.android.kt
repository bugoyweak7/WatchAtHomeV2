package com.nuvio.app.core.network

import com.google.firebase.auth.FirebaseAuth
import com.google.firebase.firestore.FirebaseFirestore

/**
 * Android Firebase entry point for the backend migration.
 *
 * Firebase is configured by the Google Services plugin using the existing
 * WatchAtHome Firebase project configuration in androidApp/.
 */
internal object FirebaseBackend {
    val auth: FirebaseAuth by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
        FirebaseAuth.getInstance()
    }

    val firestore: FirebaseFirestore by lazy(LazyThreadSafetyMode.SYNCHRONIZED) {
        FirebaseFirestore.getInstance()
    }
}
