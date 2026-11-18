// Crea el usuario de aplicación con mínimo privilegio: lectura y escritura SOLO sobre reluciente_db.
// Paso 2 (autenticado como adminMaster contra el PRIMARIO):
//   mongosh "mongodb://localhost:27017/admin?replicaSet=relucienteRS" -u adminMaster -p --file scripts/crear-usuario-app.js
db.getSiblingDB("reluciente_db").createUser({
  user: "reluciente_app",
  pwd: passwordPrompt(),
  roles: [{ role: "readWrite", db: "reluciente_db" }]
});
print("Usuario reluciente_app creado con rol readWrite sobre reluciente_db.");
