# Build local do APK (Windows)

`scripts/build-local.sh` gera o APK de release e instala no celular via `adb`, sem passar pela fila do EAS.

- Só JavaScript mudou: `scripts/build-local.sh` (minutos).
- Entrou dependência nativa ou mudou o `app.config.ts`: `scripts/build-local.sh --native` (roda o `expo prebuild`).
- O projeto é copiado para `C:\f` porque o Ninja do CMake não aguenta caminhos com mais de 260 caracteres (e o `ç` da pasta quebra o prebuild).
- Requisitos da máquina: JDK 21, Android SDK com o pacote `cmake;3.31.6` e `android.cmakeVersion=3.31.6` em `~/.gradle/gradle.properties`.
- Memória e cache do Gradle: `org.gradle.jvmargs=-Xmx6g`, `org.gradle.caching=true` em `~/.gradle/gradle.properties`.
