// Inicializa el replica set de 3 nodos: primario (27017), secundario (27018) y árbitro (27019).
// Se ejecuta UNA vez, conectado por localhost al nodo 27017 (excepción de localhost, aún sin usuarios):
//   mongosh --port 27017 --file scripts/iniciar-replica-set.js
rs.initiate({
  _id: "relucienteRS",
  members: [
    { _id: 0, host: "localhost:27017", priority: 2 },
    { _id: 1, host: "localhost:27018", priority: 1 },
    { _id: 2, host: "localhost:27019", arbiterOnly: true }
  ]
});
