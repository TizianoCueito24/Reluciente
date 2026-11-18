// Crea el usuario administrador y el usuario de aplicación. Las claves se piden por consola:
// NO quedan escritas en ningún archivo del repositorio.
// Paso 1 (sin autenticar, excepción de localhost):
//   mongosh --port 27017 --file scripts/crear-usuarios.js
const adminDb = db.getSiblingDB("admin");

// Administrador: gestiona usuarios y el cluster, pero NO lo usa la aplicación.
adminDb.createUser({
  user: "adminMaster",
  pwd: passwordPrompt(),
  roles: [
    { role: "userAdminAnyDatabase", db: "admin" },
    { role: "clusterAdmin", db: "admin" }
  ]
});
print("Usuario adminMaster creado. Ahora autenticate como adminMaster y creá el usuario de aplicación (ver README, Sección 5).");
