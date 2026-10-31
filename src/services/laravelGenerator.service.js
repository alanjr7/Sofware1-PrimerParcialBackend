import fs from 'fs';
import path from 'path';

class LaravelGeneratorService {
  /**
   * Genera la estructura completa de un proyecto Laravel 11 API REST backend.
   */
  async crearProyectoLaravelCompleto(projectName, processedData, rutaBase) {
    const { elements, herencia, relaciones, connections } = processedData;
    const projectPath = path.join(rutaBase, projectName);

    const directories = [
      'app/Http/Controllers',
      'app/Http/Controllers/Api',
      'app/Http/Requests',
      'app/Http/Resources',
      'app/Models',
      'bootstrap/cache',
      'config',
      'database/factories',
      'database/migrations',
      'database/seeders',
      'public',
      'routes',
      'storage/app/public',
      'storage/framework/cache/data',
      'storage/framework/sessions',
      'storage/framework/views',
      'storage/logs'
    ];

    for (const dir of directories) {
      const fullPath = path.join(projectPath, dir);
      fs.mkdirSync(fullPath, { recursive: true });
    }

    // Archivos de configuración base de Laravel 11
    this.generarBaseController(projectPath);
    this.generarComposerJson(projectPath, projectName);
    this.generarEnvExample(projectPath, projectName);
    this.generarGitignore(projectPath);
    this.generarStorageGitignores(projectPath);
    this.generarPublicIndex(projectPath);
    this.generarBootstrapApp(projectPath);
    this.generarConfigCors(projectPath);
    this.generarArtisan(projectPath);
    this.generarDatabaseSeeder(projectPath, elements);
    this.generarConsoleRoutes(projectPath);

    // Generar migraciones, modelos, requests, resources y controladores
    let timestampCounter = 100000;
    const datePrefix = '2024_01_01_';

    const pivotTablesGenerated = new Set();

    for (const element of elements) {
      if (element.type === 'class') {
        const timestamp = `${datePrefix}${timestampCounter++}`;
        const relacionesElement = relaciones[element.id] || [];

        // 1. Migración de tabla principal
        this.generarMigracion(projectPath, element, relacionesElement, timestamp);

        // 2. Modelo Eloquent
        this.generarModelo(projectPath, element, relacionesElement, herencia);

        // 3. Form Request para validación
        this.generarFormRequest(projectPath, element);

        // 4. API Resource para formato JSON
        this.generarResource(projectPath, element, relacionesElement);

        // 5. Controlador REST API
        this.generarControladorApi(projectPath, element, relacionesElement);

        // 6. Migraciones para tablas intermedias N:M si existen
        this.generarMigracionesPivot(projectPath, element, relacionesElement, datePrefix, timestampCounter, pivotTablesGenerated);
      }
    }

    // Generar rutas api.php
    this.generarRutasApi(projectPath, elements);

    // Generar documentación completa en README.md
    this.generarReadme(projectPath, projectName, elements, connections, relaciones);
  }

  // Helpers de nombres
  toSnakeCase(str) {
    if (!str) return '';
    return str
      .replace(/([A-Z])/g, '_$1')
      .toLowerCase()
      .replace(/^_/, '');
  }

  toPlural(str) {
    if (!str) return '';
    const snake = this.toSnakeCase(str);
    if (snake.endsWith('s') || snake.endsWith('x') || snake.endsWith('z')) return snake + 'es';
    if (snake.endsWith('y') && !/[aeiou]y$/.test(snake)) return snake.slice(0, -1) + 'ies';
    return snake + 's';
  }

  toCamelCase(str) {
    if (!str) return '';
    return str.charAt(0).toLowerCase() + str.slice(1);
  }

  capitalize(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
  }

  isValidClassTarget(target) {
    return Boolean(target && typeof target === 'string' && target.trim() !== '' && target !== 'undefined' && target !== 'null');
  }

  mapUmlTypeToLaravelMigration(type, name) {
    const t = (type || 'String').toLowerCase();
    if (t.includes('int') || t.includes('long') || t.includes('bigint') || t.includes('serial')) {
      if (name.toLowerCase() === 'id') return 'id()';
      return `integer('${name}')`;
    }
    if (t.includes('float') || t.includes('double') || t.includes('decimal') || t.includes('numeric') || t.includes('precio') || t.includes('monto') || t.includes('total') || t.includes('salary')) {
      return `decimal('${name}', 10, 2)`;
    }
    if (t.includes('bool')) {
      return `boolean('${name}')->default(true)`;
    }
    if (t.includes('date') && !t.includes('time')) {
      return `date('${name}')`;
    }
    if (t.includes('time') || t.includes('timestamp')) {
      return `dateTime('${name}')`;
    }
    if (t.includes('text') || t.includes('desc') || t.includes('observacion')) {
      return `text('${name}')->nullable()`;
    }
    return `string('${name}', 255)`;
  }

  mapUmlTypeToValidationRule(type, name) {
    const t = (type || 'String').toLowerCase();
    if (t.includes('int') || t.includes('long') || t.includes('bigint')) {
      return "'required|integer'";
    }
    if (t.includes('float') || t.includes('double') || t.includes('decimal') || t.includes('numeric')) {
      return "'required|numeric'";
    }
    if (t.includes('bool')) {
      return "'boolean'";
    }
    if (t.includes('date') || t.includes('time')) {
      return "'required|date'";
    }
    if (t.includes('email') || name.toLowerCase().includes('email') || name.toLowerCase().includes('correo')) {
      return "'required|email|max:255'";
    }
    return "'required|string|max:255'";
  }

  // 1. Migración
  generarMigracion(projectPath, element, relaciones, timestamp) {
    const className = element.name;
    const tableName = this.toPlural(className);
    const fileName = `${timestamp}_create_${tableName}_table.php`;
    const filePath = path.join(projectPath, 'database/migrations', fileName);

    let columnsCode = "            $table->id();\n";

    if (element.attributes && element.attributes.length > 0) {
      element.attributes.forEach(attr => {
        const attrName = this.toSnakeCase(attr.name);
        if (attrName !== 'id' && !attr.isForeignKey) {
          const colDef = this.mapUmlTypeToLaravelMigration(attr.type, attrName);
          columnsCode += `            $table->${colDef};\n`;
        }
      });
    }

    // Llaves foráneas (1:N o 1:1)
    if (relaciones && relaciones.length > 0) {
      relaciones.forEach(rel => {
        const targetClass = rel.targetClass || rel.nombre;
        if (!this.isValidClassTarget(targetClass)) return;

        if (rel.tipoRelacion === 'many_to_one' || rel.tipoRelacion === 'one_to_one' || (rel.tipoRelacion === 'association' && rel.isSource)) {
          const targetTable = this.toPlural(targetClass);
          const fkName = rel.fkName || `${this.toSnakeCase(targetClass)}_id`;
          columnsCode += `            $table->foreignId('${fkName}')->nullable()->constrained('${targetTable}')->nullOnDelete();\n`;
        }
      });
    }

    columnsCode += "            $table->timestamps();";

    const content = `<?php

use Illuminate\\Database\\Migrations\\Migration;
use Illuminate\\Database\\Schema\\Blueprint;
use Illuminate\\Support\\Facades\\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('${tableName}', function (Blueprint $table) {
${columnsCode}
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('${tableName}');
    }
};
`;

    fs.writeFileSync(filePath, content, 'utf8');
  }

  // Migraciones Pivot para relaciones N:M
  generarMigracionesPivot(projectPath, element, relaciones, datePrefix, startCounter, pivotTablesGenerated) {
    if (!relaciones) return;

    relaciones.forEach(rel => {
      const targetClass = rel.targetClass || rel.nombre;
      if (!this.isValidClassTarget(targetClass)) return;

      if (rel.tipoRelacion === 'many_to_many') {
        const classA = element.name;
        const classB = targetClass;
        
        // Convención Laravel para pivot: orden alfabético singular en snake_case
        const names = [this.toSnakeCase(classA), this.toSnakeCase(classB)].sort();
        const pivotTable = `${names[0]}_${names[1]}`;

        if (!pivotTablesGenerated.has(pivotTable)) {
          pivotTablesGenerated.add(pivotTable);
          const timestamp = `${datePrefix}${startCounter + 50000}`;
          const fileName = `${timestamp}_create_${pivotTable}_table.php`;
          const filePath = path.join(projectPath, 'database/migrations', fileName);

          const tableA = this.toPlural(names[0]);
          const tableB = this.toPlural(names[1]);
          const fkA = `${names[0]}_id`;
          const fkB = `${names[1]}_id`;

          const content = `<?php

use Illuminate\\Database\\Migrations\\Migration;
use Illuminate\\Database\\Schema\\Blueprint;
use Illuminate\\Support\\Facades\\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('${pivotTable}', function (Blueprint $table) {
            $table->id();
            $table->foreignId('${fkA}')->constrained('${tableA}')->cascadeOnDelete();
            $table->foreignId('${fkB}')->constrained('${tableB}')->cascadeOnDelete();
            $table->timestamps();

            $table->unique(['${fkA}', '${fkB}']);
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('${pivotTable}');
    }
};
`;
          fs.writeFileSync(filePath, content, 'utf8');
        }
      }
    });
  }

  // 2. Modelo Eloquent
  generarModelo(projectPath, element, relaciones, herencia) {
    const className = element.name;
    const tableName = this.toPlural(className);
    const filePath = path.join(projectPath, 'app/Models', `${className}.php`);

    const fillableFields = [];
    const casts = [];

    if (element.attributes && element.attributes.length > 0) {
      element.attributes.forEach(attr => {
        const attrName = this.toSnakeCase(attr.name);
        if (attrName !== 'id') {
          fillableFields.push(`'${attrName}'`);
          const t = (attr.type || '').toLowerCase();
          if (t.includes('bool')) casts.push(`        '${attrName}' => 'boolean'`);
          if (t.includes('date')) casts.push(`        '${attrName}' => 'datetime'`);
          if (t.includes('decimal') || t.includes('float') || t.includes('double')) casts.push(`        '${attrName}' => 'decimal:2'`);
          if (t.includes('int')) casts.push(`        '${attrName}' => 'integer'`);
        }
      });
    }

    // Agregar FKs a fillable
    if (relaciones && relaciones.length > 0) {
      relaciones.forEach(rel => {
        const targetClass = rel.targetClass || rel.nombre;
        if (!this.isValidClassTarget(targetClass)) return;

        if (rel.tipoRelacion === 'many_to_one' || rel.tipoRelacion === 'one_to_one' || (rel.tipoRelacion === 'association' && rel.isSource)) {
          const fkName = rel.fkName || `${this.toSnakeCase(targetClass)}_id`;
          if (!fillableFields.includes(`'${fkName}'`)) {
            fillableFields.push(`'${fkName}'`);
          }
        }
      });
    }

    // Métodos de Relaciones Eloquent
    let relationsMethods = '';
    if (relaciones && relaciones.length > 0) {
      relaciones.forEach(rel => {
        const targetClass = rel.targetClass || rel.nombre;
        if (!this.isValidClassTarget(targetClass)) {
          return;
        }

        const targetCamel = this.toCamelCase(targetClass);
        const targetPlural = this.toCamelCase(this.toPlural(targetClass));

        if (!targetCamel || targetCamel === 'undefined') return;

        if (rel.tipoRelacion === 'many_to_one' || (rel.tipoRelacion === 'association' && rel.isSource)) {
          const fkName = rel.fkName || `${this.toSnakeCase(targetClass)}_id`;
          relationsMethods += `
    public function ${targetCamel}()
    {
        return $this->belongsTo(${targetClass}::class, '${fkName}');
    }
`;
        } else if (rel.tipoRelacion === 'one_to_many' || (rel.tipoRelacion === 'association' && !rel.isSource)) {
          if (!targetPlural || targetPlural === 'undefined') return;
          const fkName = `${this.toSnakeCase(className)}_id`;
          relationsMethods += `
    public function ${targetPlural}()
    {
        return $this->hasMany(${targetClass}::class, '${fkName}');
    }
`;
        } else if (rel.tipoRelacion === 'many_to_many') {
          if (!targetPlural || targetPlural === 'undefined') return;
          relationsMethods += `
    public function ${targetPlural}()
    {
        return $this->belongsToMany(${targetClass}::class);
    }
`;
        } else if (rel.tipoRelacion === 'one_to_one') {
          relationsMethods += `
    public function ${targetCamel}()
    {
        return $this->hasOne(${targetClass}::class);
    }
`;
        }
      });
    }

    const castsBlock = casts.length > 0
      ? `
    protected $casts = [
${casts.join(',\n')}
    ];
`
      : '';

    const content = `<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Factories\\HasFactory;
use Illuminate\\Database\\Eloquent\\Model;

class ${className} extends Model
{
    use HasFactory;

    protected $table = '${tableName}';

    protected $fillable = [
        ${fillableFields.join(', ')}
    ];
${castsBlock}${relationsMethods}
}
`;

    fs.writeFileSync(filePath, content, 'utf8');
  }

  // 3. Form Request
  generarFormRequest(projectPath, element) {
    const className = element.name;
    const filePath = path.join(projectPath, 'app/Http/Requests', `${className}Request.php`);

    const rules = [];
    if (element.attributes && element.attributes.length > 0) {
      element.attributes.forEach(attr => {
        const attrName = this.toSnakeCase(attr.name);
        if (attrName !== 'id') {
          const rule = this.mapUmlTypeToValidationRule(attr.type, attr.name);
          rules.push(`            '${attrName}' => ${rule}`);
        }
      });
    }

    const content = `<?php

namespace App\\Http\\Requests;

use Illuminate\\Foundation\\Http\\FormRequest;
use Illuminate\\Contracts\\Validation\\Validator;
use Illuminate\\Http\\Exceptions\\HttpResponseException;

class ${className}Request extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $isUpdate = $this->isMethod('put') || $this->isMethod('patch');

        return [
${rules.join(',\n')}
        ];
    }

    protected function failedValidation(Validator $validator)
    {
        throw new HttpResponseException(response()->json([
            'success' => false,
            'message' => 'Errores de validación',
            'errors' => $validator->errors()
        ], 422));
    }
}
`;

    fs.writeFileSync(filePath, content, 'utf8');
  }

  // 4. API Resource
  generarResource(projectPath, element, relaciones) {
    const className = element.name;
    const filePath = path.join(projectPath, 'app/Http/Resources', `${className}Resource.php`);

    const fields = ["            'id' => $this->id"];
    if (element.attributes && element.attributes.length > 0) {
      element.attributes.forEach(attr => {
        const attrName = this.toSnakeCase(attr.name);
        if (attrName !== 'id') {
          fields.push(`            '${attrName}' => $this->${attrName}`);
        }
      });
    }

    // Incluir relaciones cuando estén cargadas (whenLoaded)
    if (relaciones && relaciones.length > 0) {
      relaciones.forEach(rel => {
        const targetClass = rel.targetClass || rel.nombre;
        if (!this.isValidClassTarget(targetClass)) return;

        if (rel.tipoRelacion === 'many_to_one' || (rel.tipoRelacion === 'association' && rel.isSource)) {
          const relationMethod = this.toCamelCase(targetClass);
          if (relationMethod && relationMethod !== 'undefined') {
            fields.push(`            '${relationMethod}' => new ${targetClass}Resource($this->whenLoaded('${relationMethod}'))`);
          }
        } else if (rel.tipoRelacion === 'one_to_many' || rel.tipoRelacion === 'many_to_many') {
          const relationMethod = this.toCamelCase(this.toPlural(targetClass));
          if (relationMethod && relationMethod !== 'undefined') {
            fields.push(`            '${relationMethod}' => ${targetClass}Resource::collection($this->whenLoaded('${relationMethod}'))`);
          }
        }
      });
    }

    fields.push("            'created_at' => $this->created_at?->toISOString()");
    fields.push("            'updated_at' => $this->updated_at?->toISOString()");

    const content = `<?php

namespace App\\Http\\Resources;

use Illuminate\\Http\\Request;
use Illuminate\\Http\\Resources\\Json\\JsonResource;

class ${className}Resource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
${fields.join(',\n')}
        ];
    }
}
`;

    fs.writeFileSync(filePath, content, 'utf8');
  }

  // Controlador Base (App\Http\Controllers\Controller)
  generarBaseController(projectPath) {
    const filePath = path.join(projectPath, 'app/Http/Controllers/Controller.php');
    const content = `<?php

namespace App\\Http\\Controllers;

abstract class Controller
{
    //
}
`;
    fs.writeFileSync(filePath, content, 'utf8');
  }

  // 5. Controlador REST API
  generarControladorApi(projectPath, element, relaciones) {
    const className = element.name;
    const varName = this.toCamelCase(className);
    const varPlural = this.toCamelCase(this.toPlural(className));
    const filePath = path.join(projectPath, 'app/Http/Controllers/Api', `${className}Controller.php`);

    // Eager loading de relaciones
    const eagerRelations = [];
    if (relaciones && relaciones.length > 0) {
      relaciones.forEach(rel => {
        const targetClass = rel.targetClass || rel.nombre;
        if (!this.isValidClassTarget(targetClass)) return;

        if (rel.tipoRelacion === 'many_to_one' || (rel.tipoRelacion === 'association' && rel.isSource)) {
          const relName = this.toCamelCase(targetClass);
          if (relName && relName !== 'undefined') eagerRelations.push(`'${relName}'`);
        } else if (rel.tipoRelacion === 'one_to_many' || rel.tipoRelacion === 'many_to_many') {
          const relName = this.toCamelCase(this.toPlural(targetClass));
          if (relName && relName !== 'undefined') eagerRelations.push(`'${relName}'`);
        }
      });
    }

    const withClause = eagerRelations.length > 0 ? `with([${eagerRelations.join(', ')}])->` : '';

    const content = `<?php

namespace App\\Http\\Controllers\\Api;

use App\\Http\\Controllers\\Controller;
use App\\Models\\${className};
use App\\Http\\Requests\\${className}Request;
use App\\Http\\Resources\\${className}Resource;
use Illuminate\\Http\\JsonResponse;
use Illuminate\\Http\\Request;

class ${className}Controller extends Controller
{
    /**
     * Listar todos los registros con paginación opcional o búsqueda.
     */
    public function index(Request $request): JsonResponse
    {
        $query = ${className}::${withClause}query();

        if ($request->has('search')) {
            $search = $request->query('search');
            // Búsqueda simple
            $query->where('id', 'like', "%{$search}%");
        }

        $perPage = $request->query('per_page', 15);
        $${varPlural} = $query->paginate($perPage);

        return response()->json([
            'success' => true,
            'data' => ${className}Resource::collection($${varPlural}),
            'meta' => [
                'current_page' => $${varPlural}->currentPage(),
                'last_page' => $${varPlural}->lastPage(),
                'per_page' => $${varPlural}->perPage(),
                'total' => $${varPlural}->total()
            ]
        ]);
    }

    /**
     * Crear un nuevo registro.
     */
    public function store(${className}Request $request): JsonResponse
    {
        try {
            $${varName} = ${className}::create($request->validated());
            
            return response()->json([
                'success' => true,
                'message' => '${className} creado exitosamente',
                'data' => new ${className}Resource($${varName})
            ], 201);
        } catch (\\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Error al crear ${className}',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Mostrar un registro específico.
     */
    public function show(string $id): JsonResponse
    {
        $${varName} = ${className}::${withClause}find($id);

        if (!$${varName}) {
            return response()->json([
                'success' => false,
                'message' => '${className} no encontrado'
            ], 404);
        }

        return response()->json([
            'success' => true,
            'data' => new ${className}Resource($${varName})
        ]);
    }

    /**
     * Actualizar un registro existente.
     */
    public function update(${className}Request $request, string $id): JsonResponse
    {
        $${varName} = ${className}::find($id);

        if (!$${varName}) {
            return response()->json([
                'success' => false,
                'message' => '${className} no encontrado'
            ], 404);
        }

        try {
            $${varName}->update($request->validated());

            return response()->json([
                'success' => true,
                'message' => '${className} actualizado exitosamente',
                'data' => new ${className}Resource($${varName})
            ]);
        } catch (\\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Error al actualizar ${className}',
                'error' => $e->getMessage()
            ], 500);
        }
    }

    /**
     * Eliminar un registro.
     */
    public function destroy(string $id): JsonResponse
    {
        $${varName} = ${className}::find($id);

        if (!$${varName}) {
            return response()->json([
                'success' => false,
                'message' => '${className} no encontrado'
            ], 404);
        }

        try {
            $${varName}->delete();

            return response()->json([
                'success' => true,
                'message' => '${className} eliminado exitosamente'
            ]);
        } catch (\\Exception $e) {
            return response()->json([
                'success' => false,
                'message' => 'Error al eliminar ${className}',
                'error' => $e->getMessage()
            ], 500);
        }
    }
}
`;

    fs.writeFileSync(filePath, content, 'utf8');
  }

  // 6. Rutas api.php
  generarRutasApi(projectPath, elements) {
    const filePath = path.join(projectPath, 'routes/api.php');

    const imports = [];
    const resources = [];

    elements.forEach(element => {
      if (element.type === 'class') {
        const className = element.name;
        const resourceName = this.toPlural(className);
        imports.push(`use App\\Http\\Controllers\\Api\\${className}Controller;`);
        resources.push(`Route::apiResource('${resourceName}', ${className}Controller::class);`);
      }
    });

    const content = `<?php

use Illuminate\\Http\\Request;
use Illuminate\\Support\\Facades\\Route;
${imports.join('\n')}

/*
|--------------------------------------------------------------------------
| API Routes Generadas Automáticamente
|--------------------------------------------------------------------------
| Rutas RESTful listas para conectar con Frontend (Flutter, Vue, React, Angular)
|
*/

Route::prefix('v1')->group(function () {
    ${resources.join('\n    ')}
});

// Ruta de estado de la API
Route::get('/health', function () {
    return response()->json([
        'status' => 'ok',
        'message' => 'API Backend Laravel funcionando correctamente',
        'timestamp' => now()
    ]);
});
`;

    fs.writeFileSync(filePath, content, 'utf8');
  }

  generarConsoleRoutes(projectPath) {
    const filePath = path.join(projectPath, 'routes/console.php');
    const content = `<?php

use Illuminate\\Foundation\\Inspiring;
use Illuminate\\Support\\Facades\\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');
`;
    fs.writeFileSync(filePath, content, 'utf8');
  }

  // Archivos auxiliares de Laravel 11
  generarComposerJson(projectPath, projectName) {
    const filePath = path.join(projectPath, 'composer.json');
    const content = `{
    "name": "laravel/${projectName}",
    "type": "project",
    "description": "Backend API REST generado desde Diagrama de Clases UML",
    "keywords": ["framework", "laravel", "api", "crud"],
    "license": "MIT",
    "require": {
        "php": "^8.2",
        "guzzlehttp/guzzle": "^7.8",
        "laravel/framework": "^11.0",
        "laravel/sanctum": "^4.0",
        "laravel/tinker": "^2.9"
    },
    "require-dev": {
        "fakerphp/faker": "^1.23",
        "mockery/mockery": "^1.6",
        "nunomaduro/collision": "^8.0",
        "phpunit/phpunit": "^11.0"
    },
    "autoload": {
        "psr-4": {
            "App\\\\": "app/",
            "Database\\\\Factories\\\\": "database/factories/",
            "Database\\\\Seeders\\\\": "database/seeders/"
        }
    },
    "autoload-dev": {
        "psr-4": {
            "Tests\\\\": "tests/"
        }
    },
    "scripts": {
        "post-autoload-dump": [
            "Illuminate\\\\Foundation\\\\ComposerScripts::postAutoloadDump",
            "@php artisan package:discover --ansi"
        ],
        "post-update-cmd": [
            "@php artisan vendor:publish --tag=laravel-assets --ansi --force"
        ],
        "post-root-package-install": [
            "@php -r \\"file_exists('.env') || copy('.env.example', '.env');\\""
        ],
        "post-create-project-cmd": [
            "@php artisan key:generate --ansi",
            "@php -r \\"file_exists('database/database.sqlite') || touch('database/database.sqlite');\\"",
            "@php artisan migrate --graceful --ansi"
        ]
    },
    "extra": {
        "laravel": {
            "dont-discover": []
        }
    },
    "config": {
        "optimize-autoloader": true,
        "preferred-install": "dist",
        "sort-packages": true,
        "allow-plugins": {
            "pestphp/pest-plugin": true,
            "php-http/discovery": true
        }
    },
    "minimum-stability": "stable",
    "prefer-stable": true
}
`;
    fs.writeFileSync(filePath, content, 'utf8');
  }

  generarEnvExample(projectPath, projectName) {
    const filePath = path.join(projectPath, '.env.example');
    const dbName = this.toSnakeCase(projectName).replace(/-/g, '_');
    const content = `APP_NAME="Laravel API"
APP_ENV=local
APP_KEY=
APP_DEBUG=true
APP_TIMEZONE=UTC
APP_URL=http://localhost:8000

APP_LOCALE=es
APP_FALLBACK_LOCALE=en
APP_FAKER_LOCALE=es_ES

BCRYPT_ROUNDS=12

LOG_CHANNEL=stack
LOG_STACK=single
LOG_DEPRECATIONS_CHANNEL=null
LOG_LEVEL=debug

DB_CONNECTION=mysql
DB_HOST=127.0.0.1
DB_PORT=3306
DB_DATABASE=${dbName}
DB_USERNAME=root
DB_PASSWORD=

SESSION_DRIVER=database
SESSION_LIFETIME=120
SESSION_ENCRYPT=false
SESSION_PATH=/
SESSION_DOMAIN=null

BROADCAST_CONNECTION=log
FILESYSTEM_DISK=local
QUEUE_CONNECTION=sync

CACHE_STORE=database
CACHE_PREFIX=
`;
    fs.writeFileSync(filePath, content, 'utf8');
    // También creamos .env por comodidad inicial
    fs.writeFileSync(path.join(projectPath, '.env'), content, 'utf8');
  }

  generarGitignore(projectPath) {
    const filePath = path.join(projectPath, '.gitignore');
    const content = `/node_modules
/public/build
/public/hot
/public/storage
/storage/*.key
/vendor
.env
.env.backup
.env.production
.phpunit.result.cache
Homestead.json
Homestead.yaml
npm-debug.log
yarn-error.log
`;
    fs.writeFileSync(filePath, content, 'utf8');
  }

  generarStorageGitignores(projectPath) {
    const gitignoreContent = "*\n!.gitignore\n";
    const dirsWithGitignore = [
      'bootstrap/cache',
      'storage/app',
      'storage/app/public',
      'storage/framework/cache',
      'storage/framework/cache/data',
      'storage/framework/sessions',
      'storage/framework/views',
      'storage/logs'
    ];

    dirsWithGitignore.forEach(dir => {
      const fullDir = path.join(projectPath, dir);
      fs.mkdirSync(fullDir, { recursive: true });
      fs.writeFileSync(path.join(fullDir, '.gitignore'), gitignoreContent, 'utf8');
    });
  }

  generarPublicIndex(projectPath) {
    const filePath = path.join(projectPath, 'public/index.php');
    const content = `<?php

use Illuminate\\Http\\Request;

define('LARAVEL_START', microtime(true));

// Determine if the application is in maintenance mode...
if (file_exists($maintenance = __DIR__.'/../storage/framework/maintenance.php')) {
    require $maintenance;
}

// Register the Composer autoloader...
require __DIR__.'/../vendor/autoload.php';

// Bootstrap Laravel and handle the request...
(require_once __DIR__.'/../bootstrap/app.php')
    ->handleRequest(Request::capture());
`;
    fs.writeFileSync(filePath, content, 'utf8');
  }

  generarConfigCors(projectPath) {
    const filePath = path.join(projectPath, 'config/cors.php');
    const content = `<?php

return [
    'paths' => ['api/*', 'sanctum/csrf-cookie'],
    'allowed_methods' => ['*'],
    'allowed_origins' => ['*'],
    'allowed_origins_patterns' => [],
    'allowed_headers' => ['*'],
    'exposed_headers' => [],
    'max_age' => 0,
    'supports_credentials' => false,
];
`;
    fs.writeFileSync(filePath, content, 'utf8');
  }

  generarBootstrapApp(projectPath) {
    const filePath = path.join(projectPath, 'bootstrap/app.php');
    const content = `<?php

use Illuminate\\Foundation\\Application;
use Illuminate\\Foundation\\Configuration\\Exceptions;
use Illuminate\\Foundation\\Configuration\\Middleware;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
    )
    ->withMiddleware(function (Middleware $middleware) {
        //
    })
    ->withExceptions(function (Exceptions $exceptions) {
        //
    })->create();
`;
    fs.writeFileSync(filePath, content, 'utf8');
  }

  generarArtisan(projectPath) {
    const filePath = path.join(projectPath, 'artisan');
    const content = `#!/usr/bin/env php
<?php

use Illuminate\\Foundation\\Console\\Kernel;
use Symfony\\Component\\Console\\Input\\ArgvInput;
use Symfony\\Component\\Console\\Output\\ConsoleOutput;

define('LARAVEL_START', microtime(true));

if (file_exists($maintenance = __DIR__.'/storage/framework/maintenance.php')) {
    require $maintenance;
}

require __DIR__.'/vendor/autoload.php';

$app = require_once __DIR__.'/bootstrap/app.php';

$kernel = $app->make(Kernel::class);

$status = $kernel->handle(
    $input = new ArgvInput,
    new ConsoleOutput
);

$kernel->terminate($input, $status);

exit($status);
`;
    fs.writeFileSync(filePath, content, 'utf8');
  }

  generarDatabaseSeeder(projectPath, elements) {
    const filePath = path.join(projectPath, 'database/seeders/DatabaseSeeder.php');
    const content = `<?php

namespace Database\\Seeders;

use Illuminate\\Database\\Seeder;

class DatabaseSeeder extends Seeder
{
    /**
     * Seed the application's database.
     */
    public function run(): void
    {
        // Añade aquí tus seeders o factories
    }
}
`;
    fs.writeFileSync(filePath, content, 'utf8');
  }

  // 7. README y documentación
  generarReadme(projectPath, projectName, elements, connections, relaciones) {
    const filePath = path.join(projectPath, 'README.md');

    let endpointsDoc = '';
    elements.forEach(element => {
      if (element.type === 'class') {
        const className = element.name;
        const resource = this.toPlural(className);
        endpointsDoc += `
### Recurso: \`${className}\` (\`/api/v1/${resource}\`)

| Método | Endpoint | Descripción |
|---|---|---|
| \`GET\` | \`/api/v1/${resource}\` | Listar todos con paginación (\`?page=1&per_page=15\`) |
| \`POST\` | \`/api/v1/${resource}\` | Crear nuevo ${className} |
| \`GET\` | \`/api/v1/${resource}/{id}\` | Obtener detalle por ID |
| \`PUT / PATCH\` | \`/api/v1/${resource}/{id}\` | Actualizar ${className} |
| \`DELETE\` | \`/api/v1/${resource}/{id}\` | Eliminar ${className} |
`;
      }
    });

    const content = `# 🚀 Proyecto Laravel 11 API Backend - ${projectName}

Este proyecto Backend RESTful en **Laravel 11** fue generado automáticamente a partir del **Diagrama de Clases UML**.

---

## 📋 Requisitos Previos

- **PHP** >= 8.2
- **Composer** instalado
- **MySQL / MariaDB**, **PostgreSQL** o **SQLite**

---

## 🛠️ Instalación y Puesta en Marcha

1. **Instalar dependencias de Composer**:
   \`\`\`bash
   composer install
   \`\`\`

2. **Configurar el entorno**:
   \`\`\`bash
   cp .env.example .env
   php artisan key:generate
   \`\`\`

3. **Configurar la base de datos en \`.env\`**:
   Abre el archivo \`.env\` y ajusta las credenciales de tu base de datos:
   \`\`\`env
   DB_CONNECTION=mysql
   DB_HOST=127.0.0.1
   DB_PORT=3306
   DB_DATABASE=nombre_de_tu_bd
   DB_USERNAME=tu_usuario
   DB_PASSWORD=tu_contraseña
   \`\`\`

4. **Ejecutar migraciones**:
   \`\`\`bash
   php artisan migrate
   \`\`\`

5. **Iniciar el servidor local**:
   \`\`\`bash
   php artisan serve
   \`\`\`
   El backend estará disponible en: \`http://localhost:8000\`

---

## 📡 Endpoints de la API REST

${endpointsDoc}

---

## 📱 Conexión con Frontend (Flutter / Web / Móvil)

Todas las rutas tienen **CORS habilitado** para permitir peticiones desde cualquier origen (ej. tu app Flutter Web en \`http://localhost:port\`).

URL Base: \`http://localhost:8000/api/v1\`
`;

    fs.writeFileSync(filePath, content, 'utf8');
  }
}

export default new LaravelGeneratorService();
