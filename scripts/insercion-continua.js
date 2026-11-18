// =====================================================================
// Reluciente - Inserción continua para la prueba de failover (Sección 7)
// Se ejecuta conectado al replica set COMPLETO (no a un solo nodo), con el usuario de aplicación:
//   mongosh "mongodb://localhost:27017,localhost:27018,localhost:27019/reluciente_db?replicaSet=relucienteRS&authSource=reluciente_db&serverSelectionTimeoutMS=30000" -u reluciente_app -p TU_CLAVE_APP --file scripts/insercion-continua.js
// Mientras corre, se detiene el mongod primario. El driver detecta la elección y sigue escribiendo
// en el nuevo primario (retryWrites=true por defecto).
// =====================================================================
const rdb = db.getSiblingDB("reluciente_db");
const TOTAL = 90;      // cantidad de inserciones (~1 por segundo)
const PAUSA_MS = 1000;

let ok = 0, fallos = 0, primarioAnterior = null;
print("Inicio de inserción continua. Detené el proceso mongod del PRIMARIO cuando quieras.");

for (let i = 1; i <= TOTAL; i++) {
  const t0 = Date.now();
  try {
    rdb.logs.insertOne({ evento: "Ping", iteracion: i, fecha: new Date() });
    ok++;
    const ms = Date.now() - t0;

    // Consultamos quién es el primario actual para dejarlo en la bitácora.
    let primario = "?";
    try { primario = db.hello().primary; } catch (e) { /* durante la elección puede fallar */ }
    if (primarioAnterior !== null && primario !== primarioAnterior) {
      print("*** CAMBIO DE PRIMARIO: " + primarioAnterior + " -> " + primario + " ***");
    }
    primarioAnterior = primario;

    // Si el insert tardó mucho, es porque estaba esperando la elección.
    const nota = ms > 2000 ? "  (esperó " + ms + " ms: elección en curso)" : "";
    print(new Date().toISOString() + " | insert OK #" + i + " | primario: " + primario + nota);
  } catch (e) {
    fallos++;
    print(new Date().toISOString() + " | FALLO en #" + i + ": " + e.message);
  }
  sleep(PAUSA_MS);
}

print("\nResumen: " + ok + " inserciones OK, " + fallos + " fallos.");
print("Documentos con evento Ping en la colección logs: " + rdb.logs.countDocuments({ evento: "Ping" }));
