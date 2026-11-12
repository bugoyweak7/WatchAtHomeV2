import SwiftUI
import ComposeApp
import FirebaseCore

@main
struct iOSApp: App {
    init() {
        if FirebaseApp.app() == nil {
            FirebaseApp.configure()
        }
    }

    @UIApplicationDelegateAdaptor(OrientationLockAppDelegate.self) private var appDelegate

    var body: some Scene {
        WindowGroup {
            ContentView()
                .preferredColorScheme(.dark)
                .onOpenURL { url in
                    AppUrlBridgeKt.handleAppUrl(url: url.absoluteString)
                }
        }
    }
}
