plugins {
    id("com.android.application")
}

android {
    namespace = "com.solitaire.app"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.solitaire.app"
        minSdk = 26
        targetSdk = 35
        // Each GitHub build gets a higher number, so a new APK installs as an update.
        versionCode = (System.getenv("GITHUB_RUN_NUMBER") ?: "1").toInt()
        versionName = "1." + (System.getenv("GITHUB_RUN_NUMBER") ?: "0")
    }

    // A fixed debug key checked into the repo, so every build is signed the same way
    // and installs over the previous one (keeping your saved game and record).
    signingConfigs {
        getByName("debug") {
            storeFile = file("debug.keystore")
            storePassword = "android"
            keyAlias = "androiddebugkey"
            keyPassword = "android"
        }
    }

    // The game itself is the web app in ../web, bundled as app assets.
    sourceSets {
        getByName("main") {
            assets.srcDirs("../web")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}
