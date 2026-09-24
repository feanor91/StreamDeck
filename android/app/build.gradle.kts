plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "com.streamdeck.client"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.streamdeck.client"
        minSdk = 24 // Android 7.0
        targetSdk = 35
        versionCode = 6
        versionName = "0.4.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            // Signé avec la clé de débogage : l'APK s'installe directement sur le téléphone.
            // Pour une publication sur le Play Store, remplacez par votre propre clé.
            signingConfig = signingConfigs.getByName("debug")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
}

kotlin {
    compilerOptions {
        jvmTarget.set(org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17)
    }
}
