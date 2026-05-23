plugins {
    java
}

group   = "net.capesearch"
version = "1.0.0"

java {
    toolchain.languageVersion = JavaLanguageVersion.of(21)
}

repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/")
}

dependencies {
    // Use the latest stable Paper API — update the version string if needed
    compileOnly("io.papermc.paper:paper-api:1.21.4-R0.1-SNAPSHOT")
}

tasks.jar {
    archiveFileName.set("CapeSearchClaim.jar")
    // Include all compiled classes in a single jar (no external deps needed)
    from(sourceSets.main.get().output)
}

tasks.withType<JavaCompile> {
    options.encoding = "UTF-8"
}
