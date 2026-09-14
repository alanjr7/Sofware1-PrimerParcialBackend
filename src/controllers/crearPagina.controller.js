import path from 'path';
import { exec } from 'child_process';
import fs from 'fs';
import archiver from 'archiver';
import { response } from '../middlewares/catchedAsync.js';
import { getSalaById, updateSala } from '../models/sala.model.js';
import { rm } from 'fs/promises';

const rutaBase = 'C:/Users/Public/Documents/proyectos';

class CrearPaginaController {
  exportar = async (req, res) => {
    const { id } = req.params;
    try {
      const [sala] = await getSalaById(id);
      if (!sala) {
        return response(res, 404, { error: 'Sala no encontrada' });
      }
      const titulo = sala.title;
      const salaData = JSON.parse(sala.xml);
      await this.nuevoArchivo(titulo);
      await this.generarComponentesDesdeJSON(titulo, salaData);
      await new Promise((resolve) => setTimeout(resolve, 9009));
      await this.comprimirProyecto(titulo);
      await this.enviarZip(res, titulo);
    } catch (error) {
      console.error('❌ Error general:', error.message);
      return response(res, 500, { error: 'Error inesperado del servidor', detalles: error.message });
    }
  };

  capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

  comprimirProyecto = async (titulo) => {
    const rutaFinal = path.join(rutaBase, titulo);
    const zipPath = path.join(rutaBase, `${titulo}.zip`);
    return new Promise((resolve, reject) => {
      const output = fs.createWriteStream(zipPath);
      const archive = archiver('zip', { zlib: { level: 9 } });
      output.on('close', () => resolve());
      archive.on('error', (err) => reject(err));
      archive.pipe(output);
      archive.directory(rutaFinal, false);
      archive.finalize();
    });
  };

  enviarZip = async (res, titulo) => {
    const rutaFinal = path.join(rutaBase, titulo);
    const zipPath = path.join(rutaBase, `${titulo}.zip`);
    try {
      const zipBuffer = fs.readFileSync(zipPath);
      res.setHeader('Content-Type', 'application/zip');
      res.setHeader('Content-Disposition', `attachment; filename=${titulo}.zip`);
      res.send(zipBuffer);
      await rm(rutaFinal, { recursive: true, force: true });
      await rm(zipPath, { force: true });
    } catch (error) {
      console.error('❌ Error al enviar o limpiar:', error.message);
      throw error;
    }
  };

  exportarSpringBootDesdeSala = async (req, res) => {
    const { id } = req.params;
    try {
      const [sala] = await getSalaById(id);
      if (!sala) {
        return response(res, 404, { error: 'Sala no encontrada' });
      }
      if (!sala.xml || sala.xml.trim() === '') {
        return response(res, 400, { error: 'La sala no tiene contenido XML para exportar' });
      }
      let salaData;
      try {
        salaData = JSON.parse(sala.xml);
      } catch (parseError) {
        console.error(`❌ Error parseando XML de sala:`, parseError);
        return response(res, 400, { error: 'El XML de la sala no es válido' });
      }
      let elements = [];
      if (salaData.elements) {
        if (Array.isArray(salaData.elements)) {
          elements = salaData.elements;
        } else if (typeof salaData.elements === 'object') {
          elements = Object.values(salaData.elements);
        }
      }
      if (elements.length === 0) {
        return response(res, 400, { error: 'No hay elementos UML en la sala para generar Spring Boot' });
      }
      const classElements = elements.filter(el => el.type === 'class');
      if (classElements.length === 0) {
        return response(res, 400, { error: 'No hay clases UML en la sala para generar entidades Spring Boot' });
      }
      classElements.forEach((el, i) => {
        console.log(`    ${i + 1}. ${el.name} (${el.type}) - Atributos: ${el.attributes ? el.attributes.length : 0}`);
      });
      const processedData = this.procesarElementosConRelaciones(classElements, []);
      const projectName = `spring-boot-${sala.title.toLowerCase().replace(/\s+/g, '-')}`;
      await this.crearProyectoSpringBootCompleto(projectName, processedData);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await this.comprimirProyecto(projectName);
      await this.enviarZip(res, projectName);
    } catch (error) {
      console.error('❌ Error exportando Spring Boot desde sala:', error.message);
      return response(res, 500, {
        error: 'Error exportando Spring Boot desde sala',
        detalles: error.message
      });
    }
  };

  exportarSpringBootConRelaciones = async (req, res) => {
    const { elements, connections } = req.body;
    if (!elements || elements.length === 0) {
      return response(res, 400, { error: 'No hay elementos para generar el proyecto Spring Boot' });
    }
    elements.forEach((el, i) => {
      if (el.type === 'class') {
        console.log(`    ${i + 1}. ${el.name} - Atributos: ${el.attributes ? el.attributes.length : 0}`);
      }
    });
    if (connections && connections.length > 0) {
      connections.forEach((conn, i) => {
        console.log(`    ${i + 1}. ${conn.type}: ${conn.source}(${conn.sourceMultiplicity}) -> ${conn.target}(${conn.targetMultiplicity})`);
      });
    }
    const classElements = elements.filter(el => el.type === 'class');
    if (classElements.length === 0) {
      return response(res, 400, { error: 'No hay clases UML para generar entidades Spring Boot' });
    }
    const processedData = this.procesarElementosConRelaciones(classElements, connections || []);
    const projectName = 'spring-boot-project';
    try {
      await this.crearProyectoSpringBootCompleto(projectName, processedData);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await this.comprimirProyecto(projectName);
      await this.enviarZip(res, projectName);
    } catch (error) {
      console.error('❌ Error generando proyecto Spring Boot:', error.message);
      return response(res, 500, {
        error: 'Error generando proyecto Spring Boot',
        detalles: error.message
      });
    }
  };

  exportarSpringBootDesdeSalaConRelaciones = async (req, res) => {
    const { id } = req.params;
    try {
      const [sala] = await getSalaById(id);
      if (!sala) {
        return response(res, 404, { error: 'Sala no encontrada' });
      }
      if (!sala.xml || sala.xml.trim() === '') {
        return response(res, 400, { error: 'La sala no tiene contenido XML para exportar' });
      }
      let salaData;
      try {
        salaData = JSON.parse(sala.xml);
      } catch (parseError) {
        console.error(`❌ Error parseando XML de sala:`, parseError);
        return response(res, 400, { error: 'El XML de la sala no es válido' });
      }
      let elements = [];
      let connections = [];
      if (salaData.elements) {
        if (Array.isArray(salaData.elements)) {
          elements = salaData.elements;
        } else if (typeof salaData.elements === 'object') {
          elements = Object.values(salaData.elements);
        }
      }
      if (salaData.connections) {
        if (Array.isArray(salaData.connections)) {
          connections = salaData.connections;
        } else if (typeof salaData.connections === 'object') {
          connections = Object.values(salaData.connections);
        }
      }
      if (elements.length === 0) {
        return response(res, 400, { error: 'No hay elementos UML en la sala para generar Spring Boot' });
      }
      const classElements = elements.filter(el => el.type === 'class');
      if (classElements.length === 0) {
        return response(res, 400, { error: 'No hay clases UML en la sala para generar entidades Spring Boot' });
      }
      classElements.forEach((el, i) => {
        console.log(`    ${i + 1}. ${el.name} (${el.type}) - Atributos: ${el.attributes ? el.attributes.length : 0}`);
      });
      connections.forEach((conn, i) => {
        console.log(`    ${i + 1}. ${conn.type}: ${conn.source}(${conn.sourceMultiplicity}) -> ${conn.target}(${conn.targetMultiplicity})`);
      });
      const processedData = this.procesarElementosConRelaciones(classElements, connections);
      const projectName = `spring-boot-${sala.title.toLowerCase().replace(/\s+/g, '-')}`;
      await this.crearProyectoSpringBootCompleto(projectName, processedData);
      await new Promise((resolve) => setTimeout(resolve, 3000));
      await this.comprimirProyecto(projectName);
      await this.enviarZip(res, projectName);
    } catch (error) {
      console.error('❌ Error exportando Spring Boot desde sala:', error.message);
      return response(res, 500, {
        error: 'Error exportando Spring Boot desde sala',
        detalles: error.message
      });
    }
  };

  generarArchivosPomXml = (projectPath) => {
    const pomContent = `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0" 
         xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
         xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 
         https://maven.apache.org/xsd/maven-4.0.0.xsd">
    <modelVersion>4.0.0</modelVersion>
    <parent>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-parent</artifactId>
        <version>3.2.10</version>
        <relativePath/>
    </parent>
    <groupId>com.example</groupId>
    <artifactId>demo</artifactId>
    <version>0.0.1-SNAPSHOT</version>
    <name>demo</name>
    <description>Generated Spring Boot project from UML diagram</description>
    <properties>
        <java.version>17</java.version>
    </properties>
    <dependencies>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-web</artifactId>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-data-jpa</artifactId>
        </dependency>
        <dependency>
            <groupId>org.postgresql</groupId>
            <artifactId>postgresql</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>com.h2database</groupId>
            <artifactId>h2</artifactId>
            <scope>runtime</scope>
        </dependency>
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-validation</artifactId>
        </dependency>
        <!-- DevTools removido para evitar actualizaciones automáticas -->
        <dependency>
            <groupId>org.springframework.boot</groupId>
            <artifactId>spring-boot-starter-test</artifactId>
            <scope>test</scope>
        </dependency>
    </dependencies>
    <build>
        <plugins>
            <plugin>
                <groupId>org.springframework.boot</groupId>
                <artifactId>spring-boot-maven-plugin</artifactId>
            </plugin>
        </plugins>
    </build>
</project>`;
    fs.writeFileSync(path.join(projectPath, 'pom.xml'), pomContent);
  };

  generarApplicationProperties = (projectPath) => {
    const propertiesContent = `# ========================================
# CONFIGURACION DE BASE DE DATOS H2 (POR DEFECTO)
# ========================================

# H2 Database Configuration (DESARROLLO/PRUEBAS)
spring.datasource.url=jdbc:h2:mem:testdb
spring.datasource.driver-class-name=org.h2.Driver
spring.datasource.username=sa
spring.datasource.password=password
spring.jpa.database-platform=org.hibernate.dialect.H2Dialect

# H2 Console habilitada para desarrollo
spring.h2.console.enabled=true
spring.h2.console.path=/h2-console

# ========================================
# CONFIGURACION JPA/HIBERNATE OPTIMIZADA PARA M:N
# ========================================
# H2 DATABASE (Desarrollo/Testing):
# create-drop: Recrea la BD completa cada vez (ideal para testing con relaciones complejas)
spring.jpa.hibernate.ddl-auto=create-drop
spring.jpa.show-sql=true

# PRESERVAR NOMBRES EXACTOS - SIN CONVERSIONES
# Crítico para tablas intermedias y constraints de FK
spring.jpa.hibernate.naming.physical-strategy=org.hibernate.boot.model.naming.PhysicalNamingStrategyStandardImpl
spring.jpa.hibernate.naming.implicit-strategy=org.hibernate.boot.model.naming.ImplicitNamingStrategyJpaCompliantImpl

# Configuración mejorada para relaciones Many-to-Many
spring.jpa.properties.hibernate.format_sql=true
spring.jpa.properties.hibernate.use_sql_comments=true
spring.jpa.properties.hibernate.jdbc.batch_size=20
spring.jpa.properties.hibernate.order_inserts=true
spring.jpa.properties.hibernate.order_updates=true

# Configuración específica para constraints y FKs
spring.jpa.properties.hibernate.hbm2ddl.auto=create-drop
spring.jpa.properties.hibernate.globally_quoted_identifiers=false
spring.jpa.properties.hibernate.globally_quoted_identifiers_skip_column_definitions=true

# Logging controlado para debugging de relaciones
logging.level.org.hibernate.SQL=INFO
logging.level.org.hibernate.type.descriptor.sql.BasicBinder=WARN
logging.level.org.hibernate.tool.schema=DEBUG

# ========================================
# INSTRUCCIONES PARA POSTGRESQL
# ========================================
# Para usar PostgreSQL con relaciones M:N:
# 1. Crea la base de datos: CREATE DATABASE springboot_db;
# 2. Ejecuta: mvnw spring-boot:run --spring.profiles.active=postgresql
# 3. Usa el archivo: application-postgresql.properties
`;
    fs.writeFileSync(path.join(projectPath, 'src/main/resources/application.properties'), propertiesContent);
    this.generarApplicationPostgreSQL(projectPath);
  };

  generarApplicationPostgreSQL = (projectPath) => {
    const postgresqlContent = `# ========================================
# CONFIGURACION POSTGRESQL - PERFIL: postgresql
# ========================================
# Este archivo solo se activa con: --spring.profiles.active=postgresql
# 
# REQUISITOS PREVIOS:
# 1. PostgreSQL instalado y ejecutándose
# 2. Base de datos creada: CREATE DATABASE springboot_db;
# 3. Usuario postgres con permisos
#
# COMPORTAMIENTO INTELIGENTE:
# ✅ Si las tablas NO EXISTEN: Las crea automáticamente
# ✅ Si las tablas YA EXISTEN: Las mantiene intactas (no las borra)
# ✅ Si hay cambios en el modelo: Actualiza el esquema automáticamente
#
# COMANDOS PARA EJECUTAR:
# Windows: .\\mvnw.cmd spring-boot:run --spring.profiles.active=postgresql
# Linux/Mac: ./mvnw spring-boot:run --spring.profiles.active=postgresql

# PostgreSQL Database Configuration
spring.datasource.url=jdbc:postgresql://localhost:5432/springboot_db
spring.datasource.username=postgres
spring.datasource.password=postgres
spring.datasource.driver-class-name=org.postgresql.Driver
spring.jpa.database-platform=org.hibernate.dialect.PostgreSQLDialect

# JPA/Hibernate Properties para PostgreSQL
# update: Crea BD/tablas si no existen, las mantiene si ya existen
spring.jpa.hibernate.ddl-auto=update
spring.jpa.show-sql=true

# Configuracion de conexiones - Sin verificaciones automáticas
spring.datasource.hikari.maximum-pool-size=20
spring.datasource.hikari.minimum-idle=5
spring.datasource.hikari.connection-test-query=
spring.datasource.hikari.validation-timeout=0
spring.datasource.hikari.leak-detection-threshold=0

# Configuracion de Hibernate para PostgreSQL (sin duplicados)
spring.jpa.properties.hibernate.format_sql=true
spring.jpa.properties.hibernate.use_sql_comments=true
spring.jpa.properties.hibernate.jdbc.batch_size=20
spring.jpa.properties.hibernate.order_inserts=true
spring.jpa.properties.hibernate.order_updates=true
spring.jpa.properties.hibernate.jdbc.lob.non_contextual_creation=true
spring.jpa.properties.hibernate.temp.use_jdbc_metadata_defaults=false

# Configuracion inteligente de esquema
spring.jpa.properties.hibernate.hbm2ddl.auto=update
spring.jpa.defer-datasource-initialization=true
spring.sql.init.continue-on-error=true

# Desactivar H2 Console en produccion
spring.h2.console.enabled=false

# Logging
logging.level.org.hibernate.SQL=INFO
logging.level.org.hibernate.type.descriptor.sql.BasicBinder=INFO
`;
    fs.writeFileSync(path.join(projectPath, 'src/main/resources/application-postgresql.properties'), postgresqlContent);
  };

  generarDemoApplication = (projectPath) => {
    const appContent = `package com.example.demo;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class DemoApplication {
    public static void main(String[] args) {
        SpringApplication.run(DemoApplication.class, args);
    }
}`;
    fs.writeFileSync(path.join(projectPath, 'src/main/java/com/example/demo/DemoApplication.java'), appContent);
  };

  generarEndpointsRelaciones = (className, relacionesElement) => {
    if (!relacionesElement || relacionesElement.length === 0) {
      return '    // Sin endpoints adicionales para relaciones';
    }
    let endpoints = `
    // ===== ENDPOINTS ESPECÍFICOS PARA RELACIONES =====`;
    relacionesElement.forEach(relacion => {
      const nombreRelacion = relacion.fkName.replace('Id', '');
      const tipoRelacionado = relacion.referenciaA;
      endpoints += `
        
    /**
     * GET /api/${className.toLowerCase()}/by-${nombreRelacion.toLowerCase()}/{${nombreRelacion}Id}
     */
    @GetMapping("/by-${nombreRelacion.toLowerCase()}/{${nombreRelacion}Id}")
    public ResponseEntity<List<${className}>> getBy${this.capitalize(nombreRelacion)}(
            @PathVariable ${relacion.fkType} ${nombreRelacion}Id) {
        // TODO: Implementar búsqueda por relación
        List<${className}> result = ${className.toLowerCase()}Service.findAll();
        return ResponseEntity.ok(result);
    }`;
    });
    return endpoints;
  };

  generarMavenWrapper = (projectPath) => {
    const wrapperProperties = `# Licensed to the Apache Software Foundation (ASF) under one
# or more contributor license agreements.  See the NOTICE file
# distributed with this work for additional information
# regarding copyright ownership.  The ASF licenses this file
# to you under the Apache License, Version 2.0 (the
# "License"); you may not use this file except in compliance
# with the License.  You may obtain a copy of the License at
#
#   https://www.apache.org/licenses/LICENSE-2.0
#
# Unless required by applicable law or agreed to in writing,
# software distributed under the License is distributed on an
# "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
# KIND, either express or implied.  See the License for the
# specific language governing permissions and limitations
# under the License.
distributionUrl=https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.5/apache-maven-3.9.5-bin.zip
wrapperUrl=https://repo.maven.apache.org/maven2/org/apache/maven/wrapper/maven-wrapper/3.2.0/maven-wrapper-3.2.0.jar`;

    fs.writeFileSync(path.join(projectPath, '.mvn/wrapper/maven-wrapper.properties'), wrapperProperties);
    const mvnwCmd = `@REM ----------------------------------------------------------------------------
@REM Licensed to the Apache Software Foundation (ASF) under one
@REM or more contributor license agreements.  See the NOTICE file
@REM distributed with this work for additional information
@REM regarding copyright ownership.  The ASF licenses this file
@REM to you under the Apache License, Version 2.0 (the
@REM "License"); you may not use this file except in compliance
@REM with the License.  You may obtain a copy of the License at
@REM
@REM    https://www.apache.org/licenses/LICENSE-2.0
@REM
@REM Unless required by applicable law or agreed to in writing,
@REM software distributed under the License is distributed on an
@REM "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY
@REM KIND, either express or implied.  See the License for the
@REM specific language governing permissions and limitations
@REM under the License.
@REM ----------------------------------------------------------------------------

@REM ----------------------------------------------------------------------------
@REM Apache Maven Wrapper startup batch script, version 3.2.0
@REM
@REM Required ENV vars:
@REM JAVA_HOME - location of a JDK home dir
@REM
@REM Optional ENV vars:
@REM MAVEN_BATCH_ECHO - set to 'on' to enable the echoing of the batch commands
@REM MAVEN_BATCH_PAUSE - set to 'on' to wait for a keystroke before ending
@REM MAVEN_OPTS - parameters passed to the Java VM when running Maven
@REM     e.g. to debug Maven itself, use
@REM set MAVEN_OPTS=-Xdebug -Xrunjdwp:transport=dt_socket,server=y,suspend=y,address=8000
@REM MAVEN_SKIP_RC - flag to disable loading of mavenrc files
@REM ----------------------------------------------------------------------------

@REM Begin all REM lines with '@' in case MAVEN_BATCH_ECHO is 'on'
@echo off
@REM set title of command window
title %0
@REM enable echoing by setting MAVEN_BATCH_ECHO to 'on'
@if "%MAVEN_BATCH_ECHO%" == "on"  echo %MAVEN_BATCH_ECHO%

@REM set %HOME% to equivalent of $HOME
if "%HOME%" == "" (set "HOME=%HOMEDRIVE%%HOMEPATH%")

@REM Execute a user defined script before this one
if not "%MAVEN_SKIP_RC%" == "" goto skipRcPre
@REM check for pre script, once with legacy .bat ending and once with .cmd ending
if exist "%USERPROFILE%\\mavenrc_pre.bat" call "%USERPROFILE%\\mavenrc_pre.bat" %*
if exist "%USERPROFILE%\\mavenrc_pre.cmd" call "%USERPROFILE%\\mavenrc_pre.cmd" %*
:skipRcPre

@setlocal

set ERROR_CODE=0

@REM To isolate internal variables from possible post scripts, we use another setlocal
@setlocal

@REM ==== START VALIDATION ====
if not "%JAVA_HOME%" == "" goto OkJHome

echo.
echo Error: JAVA_HOME not found in your environment. >&2
echo Please set the JAVA_HOME variable in your environment to match the >&2
echo location of your Java installation. >&2
echo.
goto error

:OkJHome
if exist "%JAVA_HOME%\\bin\\java.exe" goto init

echo.
echo Error: JAVA_HOME is set to an invalid directory. >&2
echo JAVA_HOME = "%JAVA_HOME%" >&2
echo Please set the JAVA_HOME variable in your environment to match the >&2
echo location of your Java installation. >&2
echo.
goto error

@REM ==== END VALIDATION ====

:init

@REM Find the project base dir, i.e. the directory that contains the folder ".mvn".
@REM Fallback to current working directory if not found.

set MAVEN_PROJECTBASEDIR=%MAVEN_BASEDIR%
IF NOT "%MAVEN_PROJECTBASEDIR%"=="" goto endDetectBaseDir

set EXEC_DIR=%CD%
set WDIR=%EXEC_DIR%
:findBaseDir
IF EXIST "%WDIR%"\\.mvn goto baseDirFound
cd ..
IF "%WDIR%"=="%CD%" goto baseDirNotFound
set WDIR=%CD%
goto findBaseDir

:baseDirFound
set MAVEN_PROJECTBASEDIR=%WDIR%
cd "%EXEC_DIR%"
goto endDetectBaseDir

:baseDirNotFound
set MAVEN_PROJECTBASEDIR=%EXEC_DIR%
cd "%EXEC_DIR%"

:endDetectBaseDir

IF NOT EXIST "%MAVEN_PROJECTBASEDIR%\\.mvn\\jvm.config" goto endReadAdditionalConfig

@setlocal EnableExtensions EnableDelayedExpansion
for /F "usebackq delims=" %%a in ("%MAVEN_PROJECTBASEDIR%\\.mvn\\jvm.config") do set JVM_CONFIG_MAVEN_PROPS=!JVM_CONFIG_MAVEN_PROPS! %%a
@endlocal & set JVM_CONFIG_MAVEN_PROPS=%JVM_CONFIG_MAVEN_PROPS%

:endReadAdditionalConfig

SET MAVEN_JAVA_EXE="%JAVA_HOME%\\bin\\java.exe"
set WRAPPER_JAR="%MAVEN_PROJECTBASEDIR%\\.mvn\\wrapper\\maven-wrapper.jar"
set WRAPPER_LAUNCHER=org.apache.maven.wrapper.MavenWrapperMain

set DOWNLOAD_URL="https://repo.maven.apache.org/maven2/org/apache/maven/wrapper/maven-wrapper/3.2.0/maven-wrapper-3.2.0.jar"

FOR /F "usebackq tokens=1,2 delims==" %%A IN ("%MAVEN_PROJECTBASEDIR%\\.mvn\\wrapper\\maven-wrapper.properties") DO (
    IF "%%A"=="wrapperUrl" SET DOWNLOAD_URL=%%B
)

@REM Extension to allow automatically downloading the maven-wrapper.jar from Maven-central
@REM This allows using the maven wrapper in projects that prohibit checking in binary data.
if exist %WRAPPER_JAR% (
    if "%MVNW_VERBOSE%" == "true" (
        echo Found %WRAPPER_JAR%
    )
) else (
    if not "%MVNW_REPOURL%" == "" (
        SET DOWNLOAD_URL="%MVNW_REPOURL%/org/apache/maven/wrapper/maven-wrapper/3.2.0/maven-wrapper-3.2.0.jar"
    )
    if "%MVNW_VERBOSE%" == "true" (
        echo Couldn't find %WRAPPER_JAR%, downloading it ...
        echo Downloading from: %DOWNLOAD_URL%
    )

    powershell -Command "&{"^
		"$webclient = new-object System.Net.WebClient;"^
		"if (-not ([string]::IsNullOrEmpty('%MVNW_USERNAME%') -and [string]::IsNullOrEmpty('%MVNW_PASSWORD%'))) {"^
		"$webclient.Credentials = new-object System.Net.NetworkCredential('%MVNW_USERNAME%', '%MVNW_PASSWORD%');"^
		"}"^
		"[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $webclient.DownloadFile('%DOWNLOAD_URL%', '%WRAPPER_JAR%')"^
		"}"
    if "%MVNW_VERBOSE%" == "true" (
        echo Finished downloading %WRAPPER_JAR%
    )
)
@REM End of extension

@REM Provide a "standardized" way to retrieve the CLI args that will
@REM work with both Windows and non-Windows executions.
set MAVEN_CMD_LINE_ARGS=%*

%MAVEN_JAVA_EXE% ^
  %JVM_CONFIG_MAVEN_PROPS% ^
  %MAVEN_OPTS% ^
  %MAVEN_DEBUG_OPTS% ^
  -classpath %WRAPPER_JAR% ^
  "-Dmaven.multiModuleProjectDirectory=%MAVEN_PROJECTBASEDIR%" ^
  %WRAPPER_LAUNCHER% %MAVEN_CMD_LINE_ARGS%
if ERRORLEVEL 1 goto error
goto end

:error
set ERROR_CODE=1

:end
@endlocal & set ERROR_CODE=%ERROR_CODE%

if not "%MAVEN_SKIP_RC%" == "" goto skipRcPost
@REM check for post script, once with legacy .bat ending and once with .cmd ending
if exist "%USERPROFILE%\\mavenrc_post.bat" call "%USERPROFILE%\\mavenrc_post.bat"
if exist "%USERPROFILE%\\mavenrc_post.cmd" call "%USERPROFILE%\\mavenrc_post.cmd"
:skipRcPost

@REM pause the script if MAVEN_BATCH_PAUSE is set to 'on'
if "%MAVEN_BATCH_PAUSE%"=="on" pause

if "%MAVEN_TERMINATE_CMD%"=="on" exit %ERROR_CODE%

cmd /C exit /B %ERROR_CODE%`;
    fs.writeFileSync(path.join(projectPath, 'mvnw.cmd'), mvnwCmd);
  };

  generarDTOsParaEntidad = async (projectPath, element, relacionesElement) => {
    const className = element.name;
    let dtoContent = `package com.example.demo.dto;

import java.time.LocalDateTime;
import java.math.BigDecimal;
import jakarta.validation.constraints.*;

/**
 * DTO para ${className}
 * Transferencia de datos sin relaciones JPA
 */
public class ${className}DTO {

`;
    if (element.attributes && element.attributes.length > 0) {
      for (const attr of element.attributes) {
        if (!attr.isForeignKey) {
          const validation = this.generarValidacionesDTO(attr);
          dtoContent += `${validation}    private ${attr.type} ${attr.name};

`;
        }
      }
    }
    dtoContent += `    public ${className}DTO() {}

`;
    if (element.attributes && element.attributes.length > 0) {
      for (const attr of element.attributes) {
        if (!attr.isForeignKey) {
          const capitalizedName = this.capitalize(attr.name);
          dtoContent += `    public ${attr.type} get${capitalizedName}() {
        return ${attr.name};
    }

    public void set${capitalizedName}(${attr.type} ${attr.name}) {
        this.${attr.name} = ${attr.name};
    }

`;
        }
      }
    }
    dtoContent += `}`;
    fs.writeFileSync(
      path.join(projectPath, `src/main/java/com/example/demo/dto/${className}DTO.java`),
      dtoContent
    );
  };

  generarGitignore = (projectPath) => {
    const gitignoreContent = `HELP.md
target/
!.mvn/wrapper/maven-wrapper.jar
!**/src/main/**/target/
!**/src/test/**/target/

### STS ###
.apt_generated
.classpath
.factorypath
.project
.settings
.springBeans
.sts4-cache

### IntelliJ IDEA ###
.idea
*.iws
*.iml
*.ipr

### NetBeans ###
/nbproject/private/
/nbbuild/
/dist/
/nbdist/
/.nb-gradle/
build/
!**/src/main/**/build/
!**/src/test/**/build/

### VS Code ###
.vscode/`;
    fs.writeFileSync(path.join(projectPath, '.gitignore'), gitignoreContent);
  };

  generarReadmeConRelaciones = (projectPath, elements, connections) => {
    const classNames = elements.filter(e => e.type === 'class').map(e => e.name);
    const totalRelaciones = connections ? connections.length : 0;
    const tiposRelaciones = {};
    if (connections) {
      connections.forEach(conn => {
        tiposRelaciones[conn.type] = (tiposRelaciones[conn.type] || 0) + 1;
      });
    }
    const readmeContent = `# 🚀 Spring Boot Project - Generated from UML with Relations

Este proyecto fue generado automáticamente desde un diagrama UML **CON SOPORTE COMPLETO PARA RELACIONES**.

## 📊 Resumen del Proyecto

### 🏛️ Entidades generadas: ${classNames.length}
${classNames.map(name => `- **${name}**`).join('\n')}

### 🔗 Relaciones implementadas: ${totalRelaciones}
${Object.entries(tiposRelaciones).map(([tipo, cantidad]) =>
      `- **${tipo.charAt(0).toUpperCase() + tipo.slice(1)}**: ${cantidad}`
    ).join('\n')}

## ⚡ Inicio Rápido (H2 - Recomendado)

### Prerrequisitos:
- ☕ Java 17 o superior
- 🛠️ No necesitas instalar Maven (incluye wrapper)

### Ejecutar el proyecto:
\`\`\`bash
# Windows
.\\mvnw.cmd spring-boot:run

# Linux/Mac  
./mvnw spring-boot:run
\`\`\`

### 🎯 Acceso inmediato:
- **API REST**: http://localhost:8080/api/
- **H2 Console**: http://localhost:8080/h2-console
  - JDBC URL: \`jdbc:h2:mem:testdb\`
  - Usuario: \`sa\`
  - Contraseña: \`password\`

## 🐘 PostgreSQL (Producción)

### Prerrequisitos:
1. PostgreSQL instalado y ejecutándose
2. Crear base de datos:
   \`\`\`sql
   CREATE DATABASE springboot_db;
   \`\`\`

### Ejecutar con PostgreSQL:
\`\`\`bash
# Windows
.\\mvnw.cmd spring-boot:run --spring.profiles.active=postgresql

# Linux/Mac
./mvnw spring-boot:run --spring.profiles.active=postgresql
\`\`\`

## 📚 Endpoints API

${classNames.map(name => `### 🔹 ${name}
- \`GET    /api/${name.toLowerCase()}\` - Listar todos
- \`GET    /api/${name.toLowerCase()}?includeRelaciones=true\` - Listar con relaciones
- \`GET    /api/${name.toLowerCase()}/{id}\` - Obtener por ID  
- \`GET    /api/${name.toLowerCase()}/{id}?includeRelaciones=true\` - Obtener con relaciones
- \`POST   /api/${name.toLowerCase()}\` - Crear nuevo
- \`PUT    /api/${name.toLowerCase()}/{id}\` - Actualizar
- \`DELETE /api/${name.toLowerCase()}/{id}\` - Eliminar
- \`GET    /api/${name.toLowerCase()}/count\` - Contar registros`).join('\n\n')}

## 🔗 Características de Relaciones

### ✅ Tipos de relación soportados:
- **Association** (Asociación)
- **Aggregation** (Agregación) 
- **Composition** (Composición)
- **Inheritance** (Herencia)
- **Dependency** (Dependencia) - Solo lógica
- **Implementation** (Implementación) - Solo lógica

### 🗄️ Mapeo automático a BD:
- Foreign Keys generadas automáticamente
- Anotaciones JPA correctas (@ManyToOne, @OneToMany, etc.)
- Herencia con estrategia TABLE_PER_CLASS
- Validación de integridad referencial

### 📋 Funcionalidades avanzadas:
- **DTOs** generados para transferencia de datos
- **Lazy/Eager loading** configurable
- **Consultas con relaciones** incluidas
- **Endpoints específicos** para navegar relaciones
- **Validación** de relaciones antes de persistir
- **Documentación** automática de relaciones

## 🛠️ Comandos Útiles

### Compilar:
\`\`\`bash
.\\mvnw.cmd clean package
\`\`\`

### Ejecutar JAR:
\`\`\`bash
java -jar target\\demo-0.0.1-SNAPSHOT.jar
\`\`\`

### Ejecutar tests:
\`\`\`bash
.\\mvnw.cmd test
\`\`\`

## 📖 Documentación Adicional

- **RELACIONES.md** - Documentación detallada de todas las relaciones
- **H2 Console** - Explorar base de datos en desarrollo
- **Swagger/OpenAPI** - Documentación automática de APIs (si está habilitado)

## 🚨 Notas Importantes

### Para Desarrollo:
- Usa H2 para desarrollo rápido (datos en memoria)
- Las tablas se recrean cada vez que inicias la aplicación
- Perfecto para testing y prototipado

### Para Producción:
- Configura PostgreSQL para datos persistentes
- Las relaciones se validan automáticamente
- Considera configurar pools de conexiones

## 🎯 Próximos Pasos

1. **Explora las entidades** en \`/src/main/java/com/example/demo/entity/\`
2. **Revisa las relaciones** en el archivo \`RELACIONES.md\`
3. **Testa los endpoints** usando Postman o curl
4. **Personaliza la lógica** de negocio en los servicios
5. **Configura validaciones** adicionales según tus reglas de negocio

## 🔧 Personalización

### Modificar relaciones:
- Edita las anotaciones JPA en las entidades
- Ajusta los fetch types (LAZY/EAGER) según necesidad
- Configura cascadas (CascadeType) apropiadas

### Agregar validaciones:
- Usa Bean Validation en los DTOs
- Implementa validaciones custom en los servicios
- Configura constraints de BD según necesidad

---

**¡Proyecto generado exitosamente con soporte completo para relaciones UML!** 🎉

Para consultas específicas, revisa la documentación en \`RELACIONES.md\`
`;
    fs.writeFileSync(path.join(projectPath, 'README.md'), readmeContent);
  };

  generateFieldWithAnnotations = (attr, isPK) => {
    let field = '';
    let annotations = '';
    const exactColumnName = attr.name;
    
    // 🔍 Detectar si es FK con constraint especial
    const isCompositePK = attr.isPrimaryKey && attr.isForeignKey;
    
    if (isPK || isCompositePK) {
      if (attr.type === 'String') {
        annotations += `    @Id
    @Column(name = "${exactColumnName}", length = 50`;
        // Agregar constraint SQL si está disponible
        if (attr.sqlType && attr.sqlType !== 'VARCHAR(255)') {
          annotations += `, columnDefinition = "${attr.sqlType}"`;
        }
        annotations += `)
    @NotBlank
`;
      } else {
        annotations += `    @Id
`;
        if (!isCompositePK) {
          annotations += `    @GeneratedValue(strategy = GenerationType.IDENTITY)
`;
        }
        annotations += `    @Column(name = "${exactColumnName}"`;
        // Agregar información de tipo SQL para PKs/FKs compuestas
        if (attr.sqlType && attr.sqlType !== 'BIGINT') {
          annotations += `, columnDefinition = "${attr.sqlType}"`;
        }
        annotations += `)
`;
      }
      
      // Agregar constraint de FK si es necesario
      if (isCompositePK && attr.referencedEntity) {
        annotations += `    // FK constraint: References ${attr.referencedEntity}(${attr.referencedField})
`;
      }
      
    } else {
      annotations += `    @Column(name = "${exactColumnName}"`;
      if (attr.type === 'String') {
        annotations += `, length = 255`;
      }
      // Usar tipo SQL específico si está disponible
      if (attr.sqlType && !['VARCHAR(255)', 'BIGINT'].includes(attr.sqlType)) {
        annotations += `, columnDefinition = "${attr.sqlType}"`;
      }
      annotations += `)
`;
      if (attr.type === 'String') {
        annotations += `    @Size(max = 255, message = "${attr.name} no puede exceder 255 caracteres")
`;
      } else if (['Integer', 'Long', 'Double', 'Float'].includes(attr.type)) {
        annotations += `    @NotNull(message = "${attr.name} es requerido")
`;
      }
    }
    field = `${annotations}    private ${attr.type} ${attr.name};

`;
    return field;
  };

  validarEstructuraJSON = (salaData) => {
    const errores = [];
    if (!salaData.elements) {
      errores.push('No se encontraron elementos en el JSON');
    }
    if (salaData.elements && Array.isArray(salaData.elements)) {
      const clases = salaData.elements.filter(el => el.type === 'class');
      if (clases.length === 0) {
        errores.push('No hay clases UML en el diagrama');
      }
      clases.forEach((clase, index) => {
        if (!clase.name || clase.name.trim() === '') {
          errores.push(`Clase ${index + 1} no tiene nombre válido`);
        }
        if (!clase.attributes || !Array.isArray(clase.attributes)) {
          errores.push(`Clase ${clase.name} no tiene atributos válidos`);
        }
      });
    }
    if (salaData.connections && Array.isArray(salaData.connections)) {
      salaData.connections.forEach((conn, index) => {
        if (!conn.source || !conn.target) {
          errores.push(`Conexión ${index + 1} no tiene source/target válidos`);
        }
        if (!conn.type) {
          errores.push(`Conexión ${index + 1} no tiene tipo definido`);
        }
        if (!conn.sourceMultiplicity || !conn.targetMultiplicity) {
          errores.push(`Conexión ${index + 1} no tiene multiplicidades definidas`);
        }
      });
    }
    return errores;
  };

  logProcesamientoCompleto = (elements, connections, relaciones, herencia) => {
    elements.forEach(element => {
      const elementRelaciones = relaciones[element.id] || [];
      const esHerencia = herencia[element.id];
      if (esHerencia) {
        if (esHerencia.esClasePadre) {
          console.log(`   - Es clase PADRE de: [${esHerencia.hijos.join(', ')}]`);
        } else {
          console.log(`   - Es clase HIJA de: ${esHerencia.clasePadre}`);
        }
      }
      elementRelaciones.forEach(rel => {
        console.log(`   - FK: ${rel.fkName} (${rel.fkType}) -> ${rel.referenciaA} [${rel.tipoRelacion}]`);
      });
    });
  };

  debugRelaciones = (connections, elements) => {
    connections.forEach((conn, index) => {
      const sourceEl = elements.find(e => e.id === conn.source);
      const targetEl = elements.find(e => e.id === conn.target);
      let fkDestino = 'No determinado';
      if ((conn.sourceMultiplicity === '*' && conn.targetMultiplicity === '1') ||
        (conn.sourceMultiplicity === '1' && conn.targetMultiplicity === '*' && conn.type === 'inheritance')) {
        fkDestino = sourceEl?.name || conn.source;
      } else if (conn.sourceMultiplicity === '1' && conn.targetMultiplicity === '*') {
        fkDestino = targetEl?.name || conn.target;
      }
    });
  };

  parseAttribute = (attribute) => {
    if (typeof attribute === 'object' && attribute !== null) {
      if (attribute.isForeignKey === true || attribute.isPrimaryKey === true) {
        const pkStatus = attribute.isPrimaryKey === true ? 'PK:true' : '';
        const fkStatus = attribute.isForeignKey === true ? 'FK:true' : '';
        const statusStr = [pkStatus, fkStatus].filter(s => s).join(', ');
        console.log(`🔍 ParseAttribute: ${attribute.name} - ${statusStr}`);
      }
      const visibility = attribute.visibility === 'private' ? '-' :
        attribute.visibility === 'protected' ? '#' : '+';
      let type = attribute.type || 'String';
      const name = attribute.name || 'field';
      if (type === 'int' || type === 'Integer') type = 'Integer';
      else if (type === 'double' || type === 'Double') type = 'Double';
      else if (type === 'bool' || type === 'boolean') type = 'Boolean';
      else if (type === 'string' || type === 'String') type = 'String';
      else if (type === 'long' || type === 'Long') type = 'Long';
      else if (type === 'float' || type === 'Float') type = 'Float';
      else if (type && type.length > 0 && type[0] === type[0].toUpperCase() &&
        !['Long', 'Integer', 'String', 'Boolean', 'Double', 'Float'].includes(type)) {
        type = 'Long';
      }
      return [visibility, type, name];
    }
    if (typeof attribute === 'string') {
      const match = attribute.match(/^([+\-#~])?\s*(\w+)?\s+(\w+)$/);
      if (match) {
        const visibility = match[1] || '+';
        let type = match[2] || 'String';
        const name = match[3];
        if (type === 'int' || type === 'Integer') type = 'Integer';
        else if (type === 'double' || type === 'Double') type = 'Double';
        else if (type === 'bool' || type === 'boolean') type = 'Boolean';
        else if (type === 'string' || type === 'String') type = 'String';
        else if (type === 'long' || type === 'Long') type = 'Long';
        else if (type === 'float' || type === 'Float') type = 'Float';
        else if (type && type.length > 0 && type[0] === type[0].toUpperCase() &&
          !['Long', 'Integer', 'String', 'Boolean', 'Double', 'Float'].includes(type)) {
          type = 'String';
        }
        return [visibility, type, name];
      }
    }
    return ['+', 'String', 'field'];
  };

  procesarElementosConRelaciones = (elements, connections) => {
    const processedElements = elements.map(element => {
      const processedElement = { ...element };
      if (processedElement.attributes && Array.isArray(processedElement.attributes)) {
        processedElement.attributes = processedElement.attributes.map(attr => {
          if (typeof attr === 'string') {
            return this.parseStringAttribute(attr);
          } else if (typeof attr === 'object') {
            return this.normalizeAttribute(attr);
          }
          return attr;
        });
      } else {
        processedElement.attributes = [];
      }
      return processedElement;
    });
    const relacionesMap = this.analizarRelaciones(processedElements, connections);
    processedElements.forEach(element => {
      if (relacionesMap[element.id]) {
        this.agregarForeignKeys(element, relacionesMap[element.id]);
      }
    });
    const herenciaInfo = this.manejarHerencia(processedElements, connections);
    console.log('✅ Procesamiento completo con relaciones terminado');
    return {
      elements: processedElements,
      herencia: herenciaInfo,
      relaciones: relacionesMap,
      connections: connections
    };
  };

  parseStringAttribute = (attrString) => {
    const cleanAttrString = (attrString || '').trim();
    if (!cleanAttrString) {
      return {
        name: 'defaultField',
        type: 'String',
        visibility: 'private',
        isPrimaryKey: false,
        isForeignKey: false,
        isStatic: false
      };
    }
    const patterns = [
      /^([+\-#~])?\s*(\w+)\s*:\s*(\w+)$/,
      /^([+\-#~])?\s*(\w+)\s+(\w+)$/,
      /^(\w+)\s*:\s*(\w+)$/,
      /^(\w+)\s+(\w+)$/,
      /^(\w+)$/
    ];
    let match = null;
    let patternIndex = -1;
    for (let i = 0; i < patterns.length; i++) {
      match = cleanAttrString.match(patterns[i]);
      if (match) {
        patternIndex = i;
        break;
      }
    }
    let visibility = 'private';
    let name = 'defaultField';
    let type = 'String';
    if (match) {
      switch (patternIndex) {
        case 0:
          visibility = this.getVisibilityFromSymbol(match[1] || '+');
          name = this.normalizeJavaFieldName(match[2]);
          type = this.mapJavaType(match[3]);
          break;
        case 1:
          visibility = this.getVisibilityFromSymbol(match[1] || '+');
          type = this.mapJavaType(match[2]);
          name = this.normalizeJavaFieldName(match[3]);
          break;
        case 2:
          name = this.normalizeJavaFieldName(match[1]);
          type = this.mapJavaType(match[2]);
          break;
        case 3:
          type = this.mapJavaType(match[1]);
          name = this.normalizeJavaFieldName(match[2]);
          break;
        case 4:
          name = this.normalizeJavaFieldName(match[1]);
          break;
      }
    }
    return {
      name,
      type,
      visibility,
      isPrimaryKey: name.toLowerCase() === 'id',
      isForeignKey: false,
      isStatic: false
    };
  };

  normalizeAttribute = (attr) => {
    const name = this.normalizeJavaFieldName(attr.name || 'defaultField');
    return {
      name,
      type: this.mapJavaType(attr.type || 'String'),
      visibility: attr.visibility || 'private',
      isPrimaryKey: attr.isPrimaryKey === true || name.toLowerCase() === 'id',
      isForeignKey: false,
      isStatic: attr.isStatic === true
    };
  };

  normalizeJavaFieldName = (name) => {
    if (!name || typeof name !== 'string') {
      return 'defaultField';
    }
    let normalized = name.trim().replace(/[^a-zA-Z0-9]/g, '');
    if (!normalized) {
      return 'defaultField';
    }
    if (!/^[a-zA-Z]/.test(normalized)) {
      normalized = 'field' + normalized;
    }
    const javaKeywords = [
      'abstract', 'boolean', 'break', 'byte', 'case', 'catch', 'char', 'class',
      'const', 'continue', 'default', 'do', 'double', 'else', 'enum', 'extends',
      'final', 'finally', 'float', 'for', 'goto', 'if', 'implements', 'import',
      'instanceof', 'int', 'interface', 'long', 'native', 'new', 'package',
      'private', 'protected', 'public', 'return', 'short', 'static', 'strictfp',
      'super', 'switch', 'synchronized', 'this', 'throw', 'throws', 'transient',
      'try', 'void', 'volatile', 'while'
    ];
    if (javaKeywords.includes(normalized.toLowerCase())) {
      normalized += 'Field';
    }
    return normalized;
  };

  getVisibilityFromSymbol = (symbol) => {
    const map = {
      '+': 'public',
      '-': 'private',
      '#': 'protected',
      '~': 'package'
    };
    return map[symbol] || 'private';
  };

  mapJavaType = (type) => {
    const typeMap = {
      'string': 'String',
      'String': 'String',
      'int': 'Integer',
      'Integer': 'Integer',
      'long': 'Long',
      'Long': 'Long',
      'double': 'Double',
      'Double': 'Double',
      'float': 'Float',
      'Float': 'Float',
      'boolean': 'Boolean',
      'Boolean': 'Boolean',
      'bool': 'Boolean',
      'date': 'LocalDateTime',
      'Date': 'LocalDateTime',
      'LocalDateTime': 'LocalDateTime',
      'BigDecimal': 'BigDecimal',
      'UUID': 'UUID'
    };
    return typeMap[type] || 'String';
  };

  crearProyectoSpringBootCompleto = async (projectName, processedData) => {
    const { elements, herencia, relaciones, connections } = processedData;
    const projectPath = path.join(rutaBase, projectName);
    const directories = [
      'src/main/java/com/example/demo',
      'src/main/java/com/example/demo/controller',
      'src/main/java/com/example/demo/service',
      'src/main/java/com/example/demo/repository',
      'src/main/java/com/example/demo/entity',
      'src/main/java/com/example/demo/dto',
      'src/main/resources',
      'src/main/resources/static',
      'src/main/resources/templates',
      'src/test/java/com/example/demo',
      '.mvn/wrapper'
    ];
    for (const dir of directories) {
      const fullPath = path.join(projectPath, dir);
      fs.mkdirSync(fullPath, { recursive: true });
    }
    this.generarArchivosPomXml(projectPath);
    this.generarApplicationProperties(projectPath);
    this.generarDemoApplication(projectPath);
    this.generarMavenWrapper(projectPath);
    this.generarGitignore(projectPath);
    this.generarReadmeConRelaciones(projectPath, elements, connections);
    for (const element of elements) {
      if (element.type === 'class') {
        await this.generarEntidadConRelaciones(
          projectPath,
          element,
          relaciones[element.id] || [],
          herencia
        );
        await this.generarRepositorioConRelaciones(projectPath, element);
        await this.generarServicioConRelaciones(projectPath, element, relaciones[element.id] || []);
        await this.generarControladorConRelaciones(projectPath, element, relaciones[element.id] || []);
        await this.generarDTOsParaEntidad(projectPath, element, relaciones[element.id] || []);
      }
    }
    await this.generarDocumentacionRelaciones(projectPath, elements, connections, relaciones);
  };

  generarEntidadConRelaciones = async (projectPath, element, relacionesElement, herenciaInfo) => {
    const className = element.name;
    
    // 🎯 Detectar si es tabla intermedia (association table)
    const esTablaIntermedia = element.isGeneratedAssociation || 
      (element.tableMetadata && element.tableMetadata.primaryKeys && element.tableMetadata.primaryKeys.length > 1);
    
    let entityContent = `package com.example.demo.entity;

import jakarta.persistence.*;
import jakarta.validation.constraints.*;
import java.time.LocalDateTime;
import java.math.BigDecimal;
import java.util.*;
import java.util.Objects;
import java.io.Serializable;
import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonManagedReference;
import com.fasterxml.jackson.annotation.JsonBackReference;

`;
    
    // 📝 Comentario especial para tablas intermedias
    if (esTablaIntermedia) {
      entityContent += `/**
 * Tabla intermedia para relación Many-to-Many
 * Configurada con clave primaria compuesta
 */
`;
    }
    if (herenciaInfo && herenciaInfo[element.id]) {
      if (herenciaInfo[element.id].esClasePadre) {
        entityContent += `@Inheritance(strategy = InheritanceType.TABLE_PER_CLASS)
@DiscriminatorColumn(name = "tipo_clase", discriminatorType = DiscriminatorType.STRING)
`;
      } else if (herenciaInfo[element.id].clasePadre) {
        entityContent += `@DiscriminatorValue("${className.toUpperCase()}")
`;
      }
    }
    entityContent += `@Entity
@Table(name = "${className.toLowerCase()}"`;
    
    // 🔑 Agregar constraints de tabla si están disponibles en metadata
    if (element.tableMetadata && element.tableMetadata.constraints && element.tableMetadata.constraints.length > 0) {
      entityContent += `,
       uniqueConstraints = {
`;
      
      // Agregar constraint de PK compuesta si existe
      const pkConstraints = element.tableMetadata.constraints.filter(c => c.includes('PRIMARY KEY'));
      if (pkConstraints.length > 0) {
        entityContent += `           // Primary key constraint manejada por @Id annotations
`;
      }
      
      entityContent += `       }`;
    }
    
    entityContent += `)`;
    
    // 🏗️ Agregar comentario SQL con constraints
    if (element.tableMetadata && element.tableMetadata.constraints) {
      entityContent += `
// SQL Constraints: ${element.tableMetadata.constraints.join('; ')}`;
    }
    const relacionesComposicion = relacionesElement.filter(rel => rel.esClavePrimariaCompuesta);
    if (relacionesComposicion.length > 0) {
      entityContent += `
@IdClass(${className}Id.class)`;
    }
    entityContent += `
public class ${className}${herenciaInfo && herenciaInfo[element.id] && herenciaInfo[element.id].clasePadre ? ' extends ' + herenciaInfo[element.id].clasePadre : ' implements Serializable'} {
    
    private static final long serialVersionUID = 1L;

`;
    let hasPrimaryKey = false;
    let pkField = null;
    let pkType = null;
    if (!herenciaInfo || !herenciaInfo[element.id] || !herenciaInfo[element.id].clasePadre) {
      if (element.attributes && element.attributes.length > 0) {
        const userPK = element.attributes.find(attr => attr.isPrimaryKey === true);
        if (userPK) {
          hasPrimaryKey = true;
          pkField = userPK.name;
          pkType = userPK.type;
          if (relacionesComposicion.length > 0) {
            entityContent += `    @Id
    @Column(name = "${pkField}")
    private ${pkType} ${pkField};

`;
          } else {
            entityContent += this.generateFieldWithAnnotations(userPK, true);
          }
        }
      }
      if (!hasPrimaryKey) {
        pkField = 'id';
        pkType = 'Long';
        entityContent += `    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "id")
    private Long id;

`;
      }
    }
    if (element.attributes && element.attributes.length > 0) {
      for (const attr of element.attributes) {
        if (!attr.isPrimaryKey && !attr.isForeignKey) {
          entityContent += this.generateFieldWithAnnotations(attr, false);
        }
      }
    }
    // 🔗 Procesar foreign keys y relaciones
    if (relacionesElement && relacionesElement.length > 0) {
      entityContent += `    // ===== FOREIGN KEYS GENERADAS POR RELACIONES =====
`;
      for (const relacion of relacionesElement) {
        if (relacion.tipoRelacion !== 'inheritance') {
          // Crear objeto de atributo con toda la información necesaria
          const fkAttribute = {
            name: relacion.fkName,
            type: relacion.fkType,
            isPrimaryKey: relacion.esClavePrimariaCompuesta || false,
            isForeignKey: true,
            sqlType: relacion.referencedSqlType || relacion.sqlType,
            referencedEntity: relacion.referenciaA,
            referencedField: relacion.pkReferenciado || 'id',
            constraintType: relacion.constraintType
          };
          
          // Usar la función mejorada para generar anotaciones
          entityContent += this.generateFieldWithAnnotations(fkAttribute, fkAttribute.isPrimaryKey);
        }
      }
    }
    if (relacionesElement && relacionesElement.length > 0) {
      entityContent += `    // ===== RELACIONES JPA =====
`;
      for (const relacion of relacionesElement) {
        if (relacion.tipoRelacion !== 'inheritance') {
          entityContent += this.generarCampoRelacionCorregido(relacion);
        }
      }
    }
    entityContent += this.generarRestoEntidad(className, element, relacionesElement, pkField, pkType);
    if (relacionesComposicion.length > 0) {
      await this.generarClaseId(projectPath, className, element, relacionesComposicion);
    }
    fs.writeFileSync(
      path.join(projectPath, `src/main/java/com/example/demo/entity/${className}.java`),
      entityContent
    );
  };

  generarCampoRelacionCorregido = (relacionInfo) => {
    const nombreCampo = relacionInfo.fkName.replace(/Id$/, '').replace(/id$/, '');
    const tipoCampo = relacionInfo.referenciaA;
    let anotaciones = '';
    let fetchType = relacionInfo.esComposicion ? 'FetchType.EAGER' : 'FetchType.LAZY';
    switch (relacionInfo.tipoRelacionJPA) {
      case '@ManyToOne':
        anotaciones += `    @ManyToOne(fetch = ${fetchType}`;
        if (relacionInfo.esComposicion) {
          anotaciones += `, cascade = CascadeType.ALL`;
        }
        anotaciones += `)
    @JoinColumn(name = "${relacionInfo.fkName}")
`;
        if (relacionInfo.esComposicion) {
          anotaciones += `    @JsonBackReference
`;
        }
        break;
      case '@OneToOne':
        anotaciones += `    @OneToOne(fetch = ${fetchType})
    @JoinColumn(name = "${relacionInfo.fkName}")
`;
        break;
    }
    return `    // Relación: ${relacionInfo.tipoRelacion} -> ${relacionInfo.referenciaA}
${anotaciones}    private ${tipoCampo} ${nombreCampo};

`;
  };

  generarRepositorioConRelaciones = async (projectPath, element) => {
    const className = element.name;
    let pkType = 'Long';
    let pkName = 'id';
    if (element.attributes && element.attributes.length > 0) {
      const userPK = element.attributes.find(attr => attr.isPrimaryKey === true && !attr.isForeignKey);
      if (userPK) {
        pkType = userPK.type;
        pkName = userPK.name;
      }
    }
    const repositoryContent = `package com.example.demo.repository;

import com.example.demo.entity.${className};
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.stereotype.Repository;
import java.util.List;
import java.util.Optional;

/**
 * Repositorio para ${className}
 * Incluye consultas personalizadas para relaciones
 */
@Repository
public interface ${className}Repository extends JpaRepository<${className}, ${pkType}> {
    
    // Consultas básicas por atributos
    ${this.generarConsultasBasicas(element)}
    
    // Método básico - usar solo si no hay problemas de N+1
    @Query("SELECT DISTINCT e FROM ${className} e")
    List<${className}> findAllWithRelaciones();
    
    @Query("SELECT DISTINCT e FROM ${className} e WHERE e.${pkName} = :${pkName}")
    Optional<${className}> findByIdWithRelaciones(@Param("${pkName}") ${pkType} ${pkName});
    
    // Consultas personalizadas se pueden agregar aquí
    // Ejemplo: List<${className}> findByNombre(String nombre);
}`;
    fs.writeFileSync(
      path.join(projectPath, `src/main/java/com/example/demo/repository/${className}Repository.java`),
      repositoryContent
    );
  };

  generarServicioConRelaciones = async (projectPath, element, relacionesElement) => {
    const className = element.name;
    let pkType = 'Long';
    let pkName = 'id';
    if (element.attributes && element.attributes.length > 0) {
      const userPK = element.attributes.find(attr => attr.isPrimaryKey === true && !attr.isForeignKey);
      if (userPK) {
        pkType = userPK.type;
        pkName = userPK.name;
      }
    }
    const capitalizedPkName = this.capitalize(pkName);
    const serviceContent = `package com.example.demo.service;

import com.example.demo.entity.${className};
import com.example.demo.repository.${className}Repository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.List;
import java.util.Optional;

/**
 * Servicio para ${className}
 * Maneja operaciones de negocio y relaciones
 */
@Service
@Transactional
public class ${className}Service {

    @Autowired
    private ${className}Repository ${className.toLowerCase()}Repository;

    /**
     * Obtener todos los ${className.toLowerCase()}s
     */
    @Transactional(readOnly = true)
    public List<${className}> findAll() {
        return ${className.toLowerCase()}Repository.findAll();
    }

    /**
     * Obtener todos con relaciones cargadas
     */
    @Transactional(readOnly = true)
    public List<${className}> findAllWithRelaciones() {
        return ${className.toLowerCase()}Repository.findAllWithRelaciones();
    }

    /**
     * Buscar ${className.toLowerCase()} por ID
     */
    @Transactional(readOnly = true)
    public Optional<${className}> findById(${pkType} ${pkName}) {
        return ${className.toLowerCase()}Repository.findById(${pkName});
    }

    /**
     * Buscar ${className.toLowerCase()} por ID con relaciones
     */
    @Transactional(readOnly = true)
    public Optional<${className}> findByIdWithRelaciones(${pkType} ${pkName}) {
        return ${className.toLowerCase()}Repository.findByIdWithRelaciones(${pkName});
    }

    /**
     * Crear un nuevo ${className.toLowerCase()}
     */
    public ${className} save(${className} ${className.toLowerCase()}) {
        // Validar relaciones antes de guardar
        this.validarRelaciones(${className.toLowerCase()});
        return ${className.toLowerCase()}Repository.save(${className.toLowerCase()});
    }

    /**
     * Actualizar un ${className.toLowerCase()} existente
     */
    public ${className} update(${pkType} ${pkName}, ${className} ${className.toLowerCase()}) {
        if (!${className.toLowerCase()}Repository.existsById(${pkName})) {
            throw new RuntimeException("${className} no encontrado con ID: " + ${pkName});
        }
        ${className.toLowerCase()}.set${capitalizedPkName}(${pkName});
        this.validarRelaciones(${className.toLowerCase()});
        return ${className.toLowerCase()}Repository.save(${className.toLowerCase()});
    }

    /**
     * Eliminar ${className.toLowerCase()} por ID
     */
    public void deleteById(${pkType} ${pkName}) {
        if (!${className.toLowerCase()}Repository.existsById(${pkName})) {
            throw new RuntimeException("${className} no encontrado con ID: " + ${pkName});
        }
        ${className.toLowerCase()}Repository.deleteById(${pkName});
    }

    /**
     * Verificar si existe ${className.toLowerCase()} por ID
     */
    @Transactional(readOnly = true)
    public boolean existsById(${pkType} ${pkName}) {
        return ${className.toLowerCase()}Repository.existsById(${pkName});
    }

    /**
     * Contar total de ${className.toLowerCase()}s
     */
    @Transactional(readOnly = true)
    public long count() {
        return ${className.toLowerCase()}Repository.count();
    }

    /**
     * Validar relaciones antes de persistir
     */
    private void validarRelaciones(${className} ${className.toLowerCase()}) {
        // TODO: Implementar validaciones específicas de relaciones
        ${this.generarValidacionesRelaciones(relacionesElement)}
    }
    
    ${this.generarMetodosRelaciones(className, relacionesElement)}
}`;
    fs.writeFileSync(
      path.join(projectPath, `src/main/java/com/example/demo/service/${className}Service.java`),
      serviceContent
    );
  };

  generarControladorConRelaciones = async (projectPath, element, relacionesElement) => {
    const className = element.name;
    let pkType = 'Long';
    let pkName = 'id';
    if (element.attributes && element.attributes.length > 0) {
      const userPK = element.attributes.find(attr => attr.isPrimaryKey === true && !attr.isForeignKey);
      if (userPK) {
        pkType = userPK.type;
        pkName = userPK.name;
      }
    }
    const controllerContent = `package com.example.demo.controller;

import com.example.demo.entity.${className};
import com.example.demo.service.${className}Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import jakarta.validation.Valid;
import java.util.List;

/**
 * Controlador REST para ${className}
 * Proporciona operaciones CRUD completas con soporte para relaciones
 */
@RestController
@RequestMapping("/api/${className.toLowerCase()}")
@CrossOrigin(origins = "*")
public class ${className}Controller {

    @Autowired
    private ${className}Service ${className.toLowerCase()}Service;

    /**
     * GET /api/${className.toLowerCase()} - Obtener todos los ${className.toLowerCase()}s
     */
    @GetMapping
    public ResponseEntity<List<${className}>> getAll(
            @RequestParam(defaultValue = "false") boolean includeRelaciones) {
        List<${className}> ${className.toLowerCase()}s;
        if (includeRelaciones) {
            ${className.toLowerCase()}s = ${className.toLowerCase()}Service.findAllWithRelaciones();
        } else {
            ${className.toLowerCase()}s = ${className.toLowerCase()}Service.findAll();
        }
        return ResponseEntity.ok(${className.toLowerCase()}s);
    }

    /**
     * GET /api/${className.toLowerCase()}/{${pkName}} - Obtener ${className.toLowerCase()} por ID
     */
    @GetMapping("/{${pkName}}")
    public ResponseEntity<${className}> getById(
            @PathVariable ${pkType} ${pkName},
            @RequestParam(defaultValue = "false") boolean includeRelaciones) {
        
        if (includeRelaciones) {
            return ${className.toLowerCase()}Service.findByIdWithRelaciones(${pkName})
                    .map(ResponseEntity::ok)
                    .orElse(ResponseEntity.notFound().build());
        } else {
            return ${className.toLowerCase()}Service.findById(${pkName})
                    .map(ResponseEntity::ok)
                    .orElse(ResponseEntity.notFound().build());
        }
    }

    /**
     * POST /api/${className.toLowerCase()} - Crear nuevo ${className.toLowerCase()}
     */
    @PostMapping
    public ResponseEntity<${className}> create(@Valid @RequestBody ${className} ${className.toLowerCase()}) {
        try {
            ${className} created${className} = ${className.toLowerCase()}Service.save(${className.toLowerCase()});
            return ResponseEntity.status(HttpStatus.CREATED).body(created${className});
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * PUT /api/${className.toLowerCase()}/{${pkName}} - Actualizar ${className.toLowerCase()} existente
     */
    @PutMapping("/{${pkName}}")
    public ResponseEntity<${className}> update(
            @PathVariable ${pkType} ${pkName}, 
            @Valid @RequestBody ${className} ${className.toLowerCase()}) {
        
        try {
            ${className} updated${className} = ${className.toLowerCase()}Service.update(${pkName}, ${className.toLowerCase()});
            return ResponseEntity.ok(updated${className});
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        } catch (Exception e) {
            return ResponseEntity.badRequest().build();
        }
    }

    /**
     * DELETE /api/${className.toLowerCase()}/{${pkName}} - Eliminar ${className.toLowerCase()}
     */
    @DeleteMapping("/{${pkName}}")
    public ResponseEntity<Void> delete(@PathVariable ${pkType} ${pkName}) {
        try {
            ${className.toLowerCase()}Service.deleteById(${pkName});
            return ResponseEntity.noContent().build();
        } catch (RuntimeException e) {
            return ResponseEntity.notFound().build();
        }
    }

    /**
     * GET /api/${className.toLowerCase()}/count - Contar total de ${className.toLowerCase()}s
     */
    @GetMapping("/count")
    public ResponseEntity<Long> count() {
        long count = ${className.toLowerCase()}Service.count();
        return ResponseEntity.ok(count);
    }

    /**
     * HEAD /api/${className.toLowerCase()}/{${pkName}} - Verificar si existe ${className.toLowerCase()}
     */
    @RequestMapping(value = "/{${pkName}}", method = RequestMethod.HEAD)
    public ResponseEntity<Void> exists(@PathVariable ${pkType} ${pkName}) {
        if (${className.toLowerCase()}Service.existsById(${pkName})) {
            return ResponseEntity.ok().build();
        } else {
            return ResponseEntity.notFound().build();
        }
    }
    
    ${this.generarEndpointsRelaciones(className, relacionesElement)}
}`;
    fs.writeFileSync(
      path.join(projectPath, `src/main/java/com/example/demo/controller/${className}Controller.java`),
      controllerContent
    );
  };

  analizarRelaciones = (elements, connections) => {
    const relacionesMap = {};
    elements.forEach(element => {
      relacionesMap[element.id] = [];
    });
    connections.forEach(conn => {
      const tipoRelacion = conn.type;
      const sourceId = conn.source;
      const targetId = conn.target;
      const sourceMultiplicity = conn.sourceMultiplicity;
      const targetMultiplicity = conn.targetMultiplicity;
      const relacionInfo = this.determinarForeignKey(
        tipoRelacion,
        sourceId,
        targetId,
        sourceMultiplicity,
        targetMultiplicity,
        elements,
        conn.label || ''
      );
      if (relacionInfo) {
        relacionesMap[relacionInfo.elementoConFK].push(relacionInfo);
      }
    });
    return relacionesMap;
  };

  determinarForeignKey = (tipoRelacion, sourceId, targetId, sourceMult, targetMult, elements, label) => {
    const sourceElement = elements.find(e => e.id === sourceId);
    const targetElement = elements.find(e => e.id === targetId);
    if (!sourceElement || !targetElement) return null;
    let elementoConFK = null;
    let elementoReferenciado = null;
    let tipoRelacionJPA = null;
    let esComposicion = false;
    let esClavePrimariaCompuesta = false;
    switch (tipoRelacion) {
      case 'association':
        if (sourceMult === '*' && targetMult === '1') {
          elementoConFK = sourceId;
          elementoReferenciado = targetId;
          tipoRelacionJPA = '@ManyToOne';
        } else if (sourceMult === '1' && targetMult === '*') {
          elementoConFK = targetId;
          elementoReferenciado = sourceId;
          tipoRelacionJPA = '@ManyToOne';
        } else if (sourceMult === '1' && targetMult === '1') {
          elementoConFK = targetId;
          elementoReferenciado = sourceId;
          tipoRelacionJPA = '@OneToOne';
        }
        break;
      case 'aggregation':
        if (sourceMult === '*' && targetMult === '1') {
          elementoConFK = sourceId;
          elementoReferenciado = targetId;
          tipoRelacionJPA = '@ManyToOne';
        } else if (sourceMult === '1' && targetMult === '*') {
          elementoConFK = targetId;
          elementoReferenciado = sourceId;
          tipoRelacionJPA = '@ManyToOne';
        }
        break;
      case 'composition':
        esComposicion = true;
        if (sourceMult === '*' && targetMult === '1') {
          elementoConFK = sourceId;
          elementoReferenciado = targetId;
          tipoRelacionJPA = '@ManyToOne';
          esClavePrimariaCompuesta = true;
        } else if (sourceMult === '1' && targetMult === '*') {
          elementoConFK = targetId;
          elementoReferenciado = sourceId;
          tipoRelacionJPA = '@ManyToOne';
          esClavePrimariaCompuesta = true;
        }
        break;
      case 'inheritance':
        if (sourceMult === '*' && targetMult === '1') {
          return this.crearRelacionHerencia(sourceId, targetId, elements);
        } else if (sourceMult === '1' && targetMult === '*') {
          return this.crearRelacionHerencia(targetId, sourceId, elements);
        }
        break;
      case 'dependency':
        return null;
      case 'implementation':
        return null;
    }
    if (!elementoConFK || !elementoReferenciado) return null;
    const elementoRef = elements.find(e => e.id === elementoReferenciado);
    const pkRef = this.obtenerAtributoPK(elementoRef);
    const fkName = `${elementoRef.name.toLowerCase()}${this.capitalize(pkRef.name)}`;
    const fkType = pkRef.type;
    return {
      elementoConFK,
      elementoReferenciado,
      tipoRelacion,
      tipoRelacionJPA,
      fkName,
      fkType,
      esComposicion,
      esClavePrimariaCompuesta,
      label: label || '',
      referenciaA: elementoRef.name,
      pkReferenciado: pkRef.name,
      pkReferenciadoTipo: pkRef.type
    };
  };

  obtenerTipoPK = (element) => {
    if (element.attributes && element.attributes.length > 0) {
      const pkAttr = element.attributes.find(attr => attr.isPrimaryKey === true);
      if (pkAttr) {
        return pkAttr.type;
      }
    }
    return 'Long';
  };

  obtenerAtributoPK = (element) => {
    if (element.attributes && element.attributes.length > 0) {
      const pkAttr = element.attributes.find(attr => attr.isPrimaryKey === true);
      if (pkAttr) {
        return {
          name: pkAttr.name,
          type: pkAttr.type
        };
      }
    }
    return {
      name: 'id',
      type: 'Long'
    };
  };

  agregarForeignKeys = (element, relaciones) => {
    if (!relaciones || relaciones.length === 0) return;
    relaciones.forEach(relacion => {
      const fkExiste = element.attributes.some(attr => attr.name === relacion.fkName);
      if (!fkExiste) {
        const fkAttribute = {
          name: relacion.fkName,
          type: relacion.fkType,
          visibility: 'private',
          isPrimaryKey: relacion.esComposicion,
          isForeignKey: true,
          isStatic: false,
          relacionInfo: relacion
        };
        element.attributes.push(fkAttribute);
        console.log(`✅ FK agregada: ${element.name}.${relacion.fkName} -> ${relacion.referenciaA}`);
      }
    });
  };

  manejarHerencia = (elements, connections) => {
    const herenciaInfo = {};
    const herenciaConnections = connections.filter(conn => conn.type === 'inheritance');
    herenciaConnections.forEach(conn => {
      let padreId, hijoId;
      if (conn.sourceMultiplicity === '1' && conn.targetMultiplicity === '*') {
        padreId = conn.source;
        hijoId = conn.target;
      } else if (conn.sourceMultiplicity === '*' && conn.targetMultiplicity === '1') {
        padreId = conn.target;
        hijoId = conn.source;
      }
      if (padreId && hijoId) {
        const padre = elements.find(e => e.id === padreId);
        const hijo = elements.find(e => e.id === hijoId);
        if (padre && hijo) {
          if (!herenciaInfo[padreId]) {
            herenciaInfo[padreId] = { esClasePadre: true, hijos: [] };
          }
          herenciaInfo[padreId].hijos.push(hijo.name);
          herenciaInfo[hijoId] = {
            esClasePadre: false,
            clasePadre: padre.name,
            padreId: padreId
          };
          console.log(`🏗️ Herencia identificada: ${hijo.name} extends ${padre.name}`);
        }
      }
    });
    return herenciaInfo;
  };

  crearRelacionHerencia = (subclaseId, superclaseId, elements) => {
    const subclase = elements.find(e => e.id === subclaseId);
    const superclase = elements.find(e => e.id === superclaseId);
    return {
      elementoConFK: subclaseId,
      elementoReferenciado: superclaseId,
      tipoRelacion: 'inheritance',
      tipoRelacionJPA: '@Inheritance',
      esHerencia: true,
      superclase: superclase.name,
      subclase: subclase.name
    };
  };

  generarAnotacionesRelacion = (relacionInfo) => {
    let anotaciones = '';
    switch (relacionInfo.tipoRelacionJPA) {
      case '@ManyToOne':
        anotaciones += `    ${relacionInfo.tipoRelacionJPA}\n`;
        anotaciones += `    @JoinColumn(name = "${relacionInfo.fkName}")\n`;
        if (relacionInfo.tipoRelacion === 'composition') {
          anotaciones += `    @JsonBackReference\n`;
        }
        break;

      case '@OneToOne':
        anotaciones += `    ${relacionInfo.tipoRelacionJPA}\n`;
        anotaciones += `    @JoinColumn(name = "${relacionInfo.fkName}")\n`;
        break;

      case '@OneToMany':
        anotaciones += `    ${relacionInfo.tipoRelacionJPA}(mappedBy = "${relacionInfo.fkName.replace('Id', '')}")\n`;
        if (relacionInfo.tipoRelacion === 'composition') {
          anotaciones += `    @JsonManagedReference\n`;
        } else {
          anotaciones += `    @JsonIgnore\n`;
        }
        break;
    }
    return anotaciones;
  };

  generarCampoRelacion = (relacionInfo) => {
    const nombreCampo = relacionInfo.fkName.replace('Id', '');
    const tipoCampo = relacionInfo.referenciaA;
    let anotaciones = '';
    switch (relacionInfo.tipoRelacionJPA) {
      case '@ManyToOne':
        anotaciones += `    @ManyToOne(fetch = FetchType.LAZY)\n`;
        anotaciones += `    @JoinColumn(name = "${relacionInfo.fkName}")\n`;
        if (relacionInfo.tipoRelacion === 'composition') {
          anotaciones += `    @JsonBackReference\n`;
        }
        break;
      case '@OneToOne':
        anotaciones += `    @OneToOne(fetch = FetchType.LAZY)\n`;
        anotaciones += `    @JoinColumn(name = "${relacionInfo.fkName}")\n`;
        break;
    }
    return `    // Relación: ${relacionInfo.tipoRelacion} -> ${relacionInfo.referenciaA}
${anotaciones}    private ${tipoCampo} ${nombreCampo};

`;
  };

  obtenerNombrePK = (nombreClase, element) => {
    return 'id';
  };

  generarConsultasBasicas = (element) => {
    let consultas = '';
    if (element.attributes && element.attributes.length > 0) {
      const atributosValidos = element.attributes.filter(attr =>
        !attr.isPrimaryKey &&
        !attr.isForeignKey &&
        attr.type === 'String' &&
        attr.name &&
        attr.name.trim() !== '' &&
        /^[a-z][a-zA-Z0-9]*$/.test(attr.name) &&
        attr.name.length >= 2
      );
      atributosValidos.slice(0, 3).forEach(attr => {
        const capitalizedName = this.capitalize(attr.name);
        consultas += `    List<${element.name}> findBy${capitalizedName}(${attr.type} ${attr.name});
    `;
      });
    }
    return consultas || '    // No hay atributos String válidos para consultas automáticas';
  };

  generarValidacionesRelaciones = (relacionesElement) => {
    if (!relacionesElement || relacionesElement.length === 0) {
      return '        // Sin relaciones que validar';
    }
    let validaciones = '';
    relacionesElement.forEach(relacion => {
      validaciones += `        // Validar ${relacion.tipoRelacion} con ${relacion.referenciaA}
        `;
    });
    return validaciones;
  };

  generarMetodosRelaciones = (className, relacionesElement) => {
    if (!relacionesElement || relacionesElement.length === 0) {
      return '    // Sin métodos adicionales para relaciones';
    }
    let metodos = `
    // ===== MÉTODOS ESPECÍFICOS PARA RELACIONES =====`;
    relacionesElement.forEach(relacion => {
      const nombreRelacion = relacion.fkName.replace('Id', '');
      const tipoRelacionado = relacion.referenciaA;
      metodos += `
    
    /**
     * Obtener ${className.toLowerCase()}s por ${nombreRelacion}
     */
    @Transactional(readOnly = true)
    public List<${className}> findBy${this.capitalize(nombreRelacion)}(${tipoRelacionado} ${nombreRelacion}) {
        // TODO: Implementar consulta personalizada
        return ${className.toLowerCase()}Repository.findAll();
    }`;
    });
    return metodos;
  };

  generarValidacionesDTO = (attr) => {
    let validaciones = '';
    if (attr.isPrimaryKey) {
      validaciones += `    // PK - sin validaciones en DTO
`;
    } else if (attr.type === 'String') {
      validaciones += `    @NotBlank(message = "${attr.name} no puede estar vacío")
    @Size(max = 255, message = "${attr.name} no puede exceder 255 caracteres")
`;
    } else if (['Integer', 'Long', 'Double', 'Float'].includes(attr.type)) {
      validaciones += `    @NotNull(message = "${attr.name} es requerido")
`;
    }
    return validaciones;
  };

  generarClaseId = async (projectPath, className, element, relacionesComposicion) => {
    const idClassName = `${className}Id`;
    let idClassContent = `package com.example.demo.entity;

import java.io.Serializable;
import java.util.Objects;

/**
 * Clase Id compuesta para ${className}
 * Utilizada en relaciones de composición
 */
public class ${idClassName} implements Serializable {
    
    private static final long serialVersionUID = 1L;

`;
    const pkOriginal = element.attributes.find(attr => attr.isPrimaryKey === true);
    if (pkOriginal) {
      idClassContent += `    private ${pkOriginal.type} ${pkOriginal.name};
`;
    }
    relacionesComposicion.forEach(relacion => {
      idClassContent += `    private ${relacion.fkType} ${relacion.fkName};
`;
    });
    idClassContent += `
    public ${idClassName}() {}

    public ${idClassName}(${pkOriginal ? pkOriginal.type + ' ' + pkOriginal.name : ''}${relacionesComposicion.length > 0 && pkOriginal ? ', ' : ''}${relacionesComposicion.map(rel => rel.fkType + ' ' + rel.fkName).join(', ')}) {
`;
    if (pkOriginal) {
      idClassContent += `        this.${pkOriginal.name} = ${pkOriginal.name};
`;
    }
    relacionesComposicion.forEach(relacion => {
      idClassContent += `        this.${relacion.fkName} = ${relacion.fkName};
`;
    });
    idClassContent += `    }

`;
    if (pkOriginal) {
      idClassContent += `    public ${pkOriginal.type} get${this.capitalize(pkOriginal.name)}() {
        return ${pkOriginal.name};
    }

    public void set${this.capitalize(pkOriginal.name)}(${pkOriginal.type} ${pkOriginal.name}) {
        this.${pkOriginal.name} = ${pkOriginal.name};
    }

`;
    }
    relacionesComposicion.forEach(relacion => {
      const capitalizedName = this.capitalize(relacion.fkName);
      idClassContent += `    public ${relacion.fkType} get${capitalizedName}() {
        return ${relacion.fkName};
    }

    public void set${capitalizedName}(${relacion.fkType} ${relacion.fkName}) {
        this.${relacion.fkName} = ${relacion.fkName};
    }

`;
    });
    const allFields = [pkOriginal?.name, ...relacionesComposicion.map(rel => rel.fkName)].filter(Boolean);
    idClassContent += `    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (o == null || getClass() != o.getClass()) return false;
        ${idClassName} that = (${idClassName}) o;
        return ${allFields.map(field => `Objects.equals(${field}, that.${field})`).join(' && ')};
    }

    @Override
    public int hashCode() {
        return Objects.hash(${allFields.join(', ')});
    }
}`;
    fs.writeFileSync(
      path.join(projectPath, `src/main/java/com/example/demo/entity/${idClassName}.java`),
      idClassContent
    );
  };

  generarDocumentacionRelaciones = async (projectPath, elements, connections, relaciones) => {
    const docContent = `# 📊 Documentación de Relaciones del Proyecto

## Diagrama de Entidades Generadas

${elements.map(el => `### 🏛️ ${el.name}
- **Atributos**: ${el.attributes ? el.attributes.length : 0}
- **Relaciones**: ${relaciones[el.id] ? relaciones[el.id].length : 0}
`).join('\n')}

## 🔗 Relaciones Identificadas

${connections.map((conn, i) => `### ${i + 1}. ${conn.type.toUpperCase()}
- **De**: ${elements.find(e => e.id === conn.source)?.name || conn.source}
- **A**: ${elements.find(e => e.id === conn.target)?.name || conn.target}  
- **Multiplicidad**: ${conn.sourceMultiplicity} -> ${conn.targetMultiplicity}
- **Etiqueta**: ${conn.label || 'Sin etiqueta'}
`).join('\n')}

## 🗄️ Mapeo a Base de Datos

${Object.entries(relaciones).map(([elementId, rels]) => {
      const element = elements.find(e => e.id === elementId);
      if (!element || !rels.length) return '';

      return `### Tabla: ${element.name.toLowerCase()}
${rels.map(rel => `- **${rel.fkName}** (${rel.fkType}) -> Referencia a ${rel.referenciaA}
  - Tipo: ${rel.tipoRelacion}
  - JPA: ${rel.tipoRelacionJPA}`).join('\n')}
`;
    }).filter(Boolean).join('\n')}

## ⚙️ Instrucciones de Uso

1. **H2**: \`./mvnw spring-boot:run\`
2. **PostgreSQL**: \`./mvnw spring-boot:run --spring.profiles.active=postgresql\`
3. **H2 Console**: http://localhost:8080/h2-console
`;
    fs.writeFileSync(path.join(projectPath, 'RELACIONES.md'), docContent);
  };

  generarRestoEntidad = (className, element, relacionesElement, pkField, pkType) => {
    let entityContent = `
    // ===== CONSTRUCTORS =====
    
    public ${className}() {
    }

`;

    // Constructor con parámetros básicos
    if (element.attributes && element.attributes.length > 0) {
      const attributosBasicos = element.attributes.filter(attr => !attr.isForeignKey);
      if (attributosBasicos.length > 0) {
        const params = attributosBasicos.map(attr => `${attr.type} ${attr.name}`).join(', ');
        entityContent += `    public ${className}(${params}) {
`;
        attributosBasicos.forEach(attr => {
          entityContent += `        this.${attr.name} = ${attr.name};
`;
        });
        entityContent += `    }

`;
      }
    }

    entityContent += `    // ===== GETTERS AND SETTERS =====

`;

    // Getters y setters para PK
    if (pkField && pkType) {
      const capitalizedPk = this.capitalize(pkField);
      entityContent += `    public ${pkType} get${capitalizedPk}() {
        return ${pkField};
    }

    public void set${capitalizedPk}(${pkType} ${pkField}) {
        this.${pkField} = ${pkField};
    }

`;
    }

    // Getters y setters para atributos normales
    if (element.attributes && element.attributes.length > 0) {
      element.attributes.forEach(attr => {
        if (!attr.isPrimaryKey && !attr.isForeignKey) {
          const capitalizedName = this.capitalize(attr.name);
          entityContent += `    public ${attr.type} get${capitalizedName}() {
        return ${attr.name};
    }

    public void set${capitalizedName}(${attr.type} ${attr.name}) {
        this.${attr.name} = ${attr.name};
    }

`;
        }
      });
    }

    // Getters y setters para foreign keys
    if (relacionesElement && relacionesElement.length > 0) {
      relacionesElement.forEach(relacion => {
        if (relacion.tipoRelacion !== 'inheritance') {
          const capitalizedFk = this.capitalize(relacion.fkName);
          entityContent += `    public ${relacion.fkType} get${capitalizedFk}() {
        return ${relacion.fkName};
    }

    public void set${capitalizedFk}(${relacion.fkType} ${relacion.fkName}) {
        this.${relacion.fkName} = ${relacion.fkName};
    }

`;

          // Getter y setter para el objeto relacionado
          const nombreCampoRelacion = relacion.fkName.replace(/Id$/, '').replace(/id$/, '');
          const capitalizedRelacion = this.capitalize(nombreCampoRelacion);
          entityContent += `    public ${relacion.referenciaA} get${capitalizedRelacion}() {
        return ${nombreCampoRelacion};
    }

    public void set${capitalizedRelacion}(${relacion.referenciaA} ${nombreCampoRelacion}) {
        this.${nombreCampoRelacion} = ${nombreCampoRelacion};
    }

`;
        }
      });
    }

    entityContent += `    // ===== UTILITY METHODS =====

    @Override
    public String toString() {
        return "${className}{" +
`;

    // Agregar campos al toString
    const allFields = [];
    if (pkField) allFields.push(`"${pkField}=" + ${pkField}`);
    
    if (element.attributes && element.attributes.length > 0) {
      element.attributes.forEach(attr => {
        if (!attr.isPrimaryKey && !attr.isForeignKey) {
          allFields.push(`", ${attr.name}=" + ${attr.name}`);
        }
      });
    }

    if (relacionesElement && relacionesElement.length > 0) {
      relacionesElement.forEach(relacion => {
        if (relacion.tipoRelacion !== 'inheritance') {
          allFields.push(`", ${relacion.fkName}=" + ${relacion.fkName}`);
        }
      });
    }

    entityContent += allFields.join(' +\n                ');
    entityContent += ` +
                '}';
    }

    @Override
    public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof ${className})) return false;
        ${className} that = (${className}) o;
        return Objects.equals(${pkField || 'id'}, that.${pkField || 'id'});
    }

    @Override
    public int hashCode() {
        return Objects.hash(${pkField || 'id'});
    }
}`;

    return entityContent;
  };

  capitalize = (str) => {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  };
}

export default new CrearPaginaController();
