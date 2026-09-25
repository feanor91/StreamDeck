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
        versionCode = 10
        versionName = "0.7.0"
    }

    // Clé de signature fournie par l'environnement (secrets GitHub dans la CI) :
    // toutes les versions publiées portent la même signature et s'installent
    // par-dessus la précédente. Sans ces variables, la clé de débogage est utilisée.
    val keystore = System.getenv("SIGNING_STORE_FILE")?.takeIf { it.isNotBlank() }?.let { file(it) }
    signingConfigs {
        if (keystore != null) {
            create("deck") {
                storeFile = keystore
                storePassword = System.getenv("SIGNING_STORE_PASSWORD")
                keyAlias = System.getenv("SIGNING_KEY_ALIAS")
                keyPassword = System.getenv("SIGNING_KEY_PASSWORD")
                enableV1Signing = true
                enableV2Signing = true
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName(if (keystore != null) "deck" else "debug")
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
