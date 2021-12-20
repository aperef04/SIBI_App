const express = require("express");
const app = express();
const port = 8100;
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const ejs = require("ejs");
app.set("view engine", "ejs");
const neo4j = require("neo4j-driver");
const { concat } = require("rxjs");
const e = require("express");

const uri = "neo4j+s://f57d3d57.databases.neo4j.io";
const user = "neo4j";
const password = "KmIkvbY0xrq0Un4qw4zscHzelfbs9R_lPdu72U7HR70";
const driver = neo4j.driver(uri, neo4j.auth.basic(user, password), {
  disableLosslessIntegers: true,
});
const session = driver.session();

app.use("/", express.static(__dirname + "/"));

app.listen(port, () => {
  console.log(`Running ${port}`);
});
app.get("/", function (req, res) {
  res.render("login", {
    error: false,
  });
});


app.post("/sign_in", function (req, res) {
  let query =
    "CREATE (u:User { username: $user}) SET u.email = $email, u.name = $nombre, u.password = $password";
  let nombre = req.body.name;
  let user = req.body.username;
  let password = req.body.password;
  let email = req.body.email;
  session.writeTransaction((tx) =>
    tx.run(query, { user, email, nombre, password })
  );
  res.render("login", {
    error: false,
  });
});

app.post("/login", async function (req, res) {
  let query =
    "MATCH (n:User) where n.username = $user RETURN n.password as pass";
  let query2 = 
    "MATCH (n:User)-[r:RATES]-(a:Car) where n.username =$user RETURN count(r) as relaciones"
  let user = req.body.username;
  let password = req.body.password;
  let pass = "";
  const result = await session.run(query, { user });
  const result2 = await session.run(query2, { user });
  if (result.records.length != 0) pass = result.records[0].get("pass");
  if (pass == password){
    if(result2.records[0].get("relaciones")>4){
      res.redirect("/recomendaciones?user=" + user);
    }else{
      res.redirect("/nuevoUser?user=" + user);
    }
  } 
  else
    res.render("login", {
      error: true,
    });
});

app.get("/recomendaciones", async function (req, res) {
  let user = req.query.user;
  let resultado = await algoritmo(user);
  let query = "MATCH (c:Car) Where c.id = $id RETURN c";
  let array = [];
  let marcas = await getDiferentMakes();
  for (let i = 0; i < resultado.length && i < 10; i++) {
    let coche = {};
    let id = resultado[i].id;
    const result = await session.run(query, { id });
    coche = result.records[0]._fields[0].properties;
    array.push(coche);
  }
  console.log(array);
  res.render("recomendaciones", {
    coches: array,
    marcas:marcas,
  });
});

app.get("/marca",async function(req,res){
  let array = [];
  let user = req.query.user;
  let marca = req.query.marca;
  let query = "MATCH (c:Car)-[r:ISFROM]->(m:Make),(u:User) \
  where m.name =$marca and  u.username = $user and not (u)-[:RATES]-(c)\
  return c LIMIT 25";
  const result = await session.run(query, { marca,user });
  for (let i = 0; i < result.records.length; i++) {
    let coche = {};
    coche = result.records[i]._fields[0].properties;
    array.push(coche);
  }
  res.render("marca", {
    coches: array,
    marca:marca,
  });
});

app.get("/puntuados",async function(req,res){
  let array = [];
  let ratings = [];
  let user = req.query.user;
  let query = "MATCH(u:User)-[r:RATES]->(c:Car) where u.username = $user return c as car, r.rating as rating";
  const result = await session.run(query, {user });
  for (let i = 0; i < result.records.length; i++) {
    let coche = {};
    coche = result.records[i]._fields[0].properties;
    ratings.push( result.records[i]._fields[1])
    array.push(coche);
  }
  res.render("puntuados", {
    coches: array,
    ratings: ratings,
  });
});

app.get("/nuevoUser", async function (req, res) {

  let array = await cochesIniciales()
  res.render("nuevoUser", {
    coches: array,
  });
});




async function cochesIniciales() {
  let array = [];
  let query =
    "MATCH (c:Car) where c.id = 444 or c.id = 738 or c.id =1627 or c.id = 89 or c.id =181 RETURN c ";
  const result = await session.run(query);
  for (let i = 0; i < result.records.length; i++) {
    let coche = {};
    coche = result.records[i]._fields[0].properties;
    array.push(coche);
  }
  return array;
}

app.post("/rate", function (req, res) {
  let query =
    "MATCH (u:User), (c:Car)   WHERE u.username = $user AND c.id = $car   MERGE (u)-[r:RATES]->(c) SET r.rating = $rating";
  let user = req.body.user;
  let car = parseInt(req.body.carId);
  let rating = parseInt(req.body.rating);
  session.writeTransaction((tx) => tx.run(query, { user, car, rating }));
  res.send("ok");
});

async function algoritmo(user) {
  let items1 = await contenido(user);
  let items2 = await colaborativo(user);
  console.log(items1);
  console.log(items2);
  return hibrido(items1, items2);
}

// Algoritmo basado en contenido

async function getAllCars() {
  var res = [];
  let query =
    "MATCH (c:Car)-[i:ISFROM]->(m:Make), (c)-[:SELL_IN]->(p:Province) \
              RETURN c.change as change, p.name as province, m.name as make, c.id as carId, c.price as price,c.kms as kms";
  const result = await session.run(query);
  result.records.forEach((record) => {
    res.push(record);
  });
  return res;
}

async function getCarsRated(user) {
  let res = [];
  let query =
    "MATCH (c:Car)-[i:ISFROM]->(m:Make), (c)-[:SELL_IN]->(p:Province), (u:User)-[r:RATES]->(c) \
    WHERE u.username = $user \
    RETURN c.change as change, p.name as province, m.name as make, c.id as carId, r.rating as rating, c.price as price,c.kms as kms";
  const result = await session.run(query, { user });
  result.records.forEach((record) => {
    res.push(record);
  });
  return res;
}
async function getDiferentChanges() {
  let query = "MATCH (n:Car) WITH  distinct n.change as m RETURN collect(m)";
  const a = await session.run(query);
  return a.records[0]._fields[0];
}

async function getDiferentProvinces() {
  let query = "MATCH (n:Province) RETURN collect(n.name)";
  const a = await session.run(query);
  return a.records[0]._fields[0];
}

async function getDiferentMakes() {
  let query = "MATCH (n:Make) RETURN collect(n.name)";
  const a = await session.run(query);
  return a.records[0]._fields[0];
}

function getIdsRated(array) {
  let ids = new Array();
  for (let index = 0; index < array.length; index++) {
    ids.push(array[index].get("carId"));
  }
  return ids;
}
var numPrices = [5000, 10000, 15000, 25000, 40000, 60000, 1];
var numKms = [1000, 10000, 50000, 150000, 1];

async function contenido(user) {
  let all_Cars = await getAllCars();
  let carsRated = await getCarsRated(user);
  let idsRated = getIdsRated(carsRated);
  let changes = await getDiferentChanges();
  let provinces = await getDiferentProvinces();
  let makes = await getDiferentMakes();

  let prices = ["P1", "P2", "P3", "P4", "P5", "P6", "P7"];
  let kms = ["K1", "K2", "K3", "K4", "K5"];
  let conca = prices.concat(changes.concat(provinces.concat(makes)));
  let profile = makeProfile(carsRated, conca);
  let all = makeAllCarsProfile(all_Cars, conca, idsRated);
  all[0] = profile;

  let items = getSimilarity(all);
  return items;
}

function makeAllCarsProfile(all_Cars, conca, idsRated) {
  let all = new Array(all_Cars.length + 1 - idsRated.length);
  all[0] = conca.slice();
  let contador = 0;
  for (let i = 0; i < all_Cars.length; i++) {
    const car = all_Cars[i];
    if (idsRated.includes(car.get("carId"))) continue;

    all[contador + 1] = conca.slice();

    for (let index = 0; index < numPrices.length; index++) {
      if (car.get("price") <= numPrices[index]) {
        all[contador + 1][index] = 3;
        break;
      }
    }
    for (
      let index = numPrices.length;
      index < numPrices.length + numKms.length;
      index++
    ) {
      if (car.get("kms") <= numKms[index - numPrices.length]) {
        all[contador + 1][index] = 3;
        break;
      }
    }
    if (all[contador + 1].includes(car.get("change"))) {
      let pos = all[contador + 1].indexOf(car.get("change"));
      all[contador + 1][pos] = 2;
    }

    if (all[contador + 1].includes(car.get("province"))) {
      let pos = all[contador + 1].indexOf(car.get("province"));
      all[contador + 1][pos] = 1;
    }

    if (all[contador + 1].includes(car.get("make"))) {
      let pos = all[contador + 1].indexOf(car.get("make"));
      all[contador + 1][pos] = 2;
    }
    all[contador + 1].push(car.get("carId"));
    contador++;
  }
  for (let index = 1; index < all.length; index++) {
    putZeros(all[index]);
  }
  return all;
}

function makeProfile(carsRated, conca) {
  let profileArray = new Array(carsRated.length + 1);
  let profile = new Array(conca.length);
  profileArray[0] = conca.slice();
  for (let i = 0; i < carsRated.length; i++) {
    const car = carsRated[i];
    let rating = car.get("rating");
    profileArray[i + 1] = conca.slice();

    for (let index = 0; index < numPrices.length; index++) {
      if (car.get("price") <= numPrices[index]) {
        profileArray[i + 1][index] = 3 * rating;
        break;
      }
    }
    for (
      let index = numPrices.length;
      index < numPrices.length + numKms.length;
      index++
    ) {
      if (car.get("kms") <= numKms[index - numPrices.length]) {
        profileArray[i + 1][index] = 3 * rating;
        break;
      }
    }

    if (profileArray[i + 1].includes(car.get("change"))) {
      let pos = profileArray[i + 1].indexOf(car.get("change"));
      profileArray[i + 1][pos] = 2 * rating;
    }

    if (profileArray[i + 1].includes(car.get("province"))) {
      let pos = profileArray[i + 1].indexOf(car.get("province"));
      profileArray[i + 1][pos] = 1 * rating;
    }

    if (profileArray[i + 1].includes(car.get("make"))) {
      let pos = profileArray[i + 1].indexOf(car.get("make"));
      profileArray[i + 1][pos] = 2 * rating;
    }
  }
  for (let index = 1; index < profileArray.length; index++) {
    putZeros(profileArray[index]);
  }
  for (let i = 0; i < profileArray[0].length; i++) {
    let suma = 0;
    let frecuencia = 0;
    for (let j = 1; j < profileArray.length; j++) {
      suma += profileArray[j][i];
      if (profileArray[j][i] != 0) frecuencia++;
    }
    if (frecuencia != 0) {
      let media = suma / frecuencia;
      profile[i] = (media / 5) * (frecuencia / (profileArray.length - 1));
    } else {
      profile[i] = 0;
    }
  }
  profile.push("P");
  return profile;
}

function putZeros(array) {
  for (let index = 0; index < array.length; index++) {
    if (isNaN(array[index])) {
      array[index] = 0;
    }
  }
}

function getSimilarity(all) {
  let items = [];
  for (let index = 1; index < all.length; index++) {
    cosFunction(items, all[0], all[index]);
  }
  items.sort(function (a, b) {
    if (a.similarity > b.similarity) {
      return -1;
    }
    if (a.similarity < b.similarity) {
      return 1;
    }
    return 0;
  });

  return items;
}

function cosFunction(items, profile, car) {
  let sim;
  let numerador = 0;
  let denominador1 = 0;
  let denominador2 = 0;
  for (let index = 0; index < profile.length - 1; index++) {
    numerador += profile[index] * car[index];
    denominador1 += Math.pow(profile[index], 2);
    denominador2 += Math.pow(car[index], 2);
  }
  denominador1 = Math.sqrt(denominador1);
  denominador2 = Math.sqrt(denominador2);
  sim = numerador / (denominador1 * denominador2);
  if (sim > 0.5) {
    items.push({ similarity: sim, id: car[car.length - 1] });
  }
}

//Algoritmo de filtrado colaborativo

async function colaborativo(user) {
  let ratedCars = await getRatedCars(user);
  let allCars = await getSimilarUsers(user);
  let a = [];
  a[0] = ratedCars[0]._fields;
  let array = [];
  allCars.forEach((record) => {
    array.push(record._fields);
  });
  let todo = a.concat(array);
  let matriz = [];
  crearMatriz(matriz, todo);
  calculoMedias(matriz);
  let pearson = [];
  pearsonCorrelation(matriz, pearson);
  let items = getSimilarityColaborative(matriz, pearson);
  return items;
}


function getSimilarityColaborative(matriz, pearson) {
  let items = [];
  for (let i = 1; i < matriz[0].length - 1; i++) {
    let numerador = 0;
    let denominador = 0;
    for (let j = 0; j < pearson.length && j < 10; j++) {
      let pos = pearson[j].pos;
      if (matriz[1][i] == 0 && matriz[pos][i] != 0 && pearson[j].score > 0) {
        numerador +=
          pearson[j].score *
          (matriz[pos][i] - matriz[pos][matriz[pos].length - 1]);
        denominador += pearson[j].score;
      }
    }
    let prediccion = matriz[1][matriz[1].length - 1] + numerador / denominador;
    if (prediccion > 5) prediccion = 5;
    if (prediccion < 0) prediccion = 0;
    prediccion /= 5;
    if (prediccion >= 0) {
      items.push({ similarity: prediccion, id: matriz[0][i] });
    }
  }
  items.sort(function (a, b) {
    if (a.similarity > b.similarity) {
      return -1;
    }
    if (a.similarity < b.similarity) {
      return 1;
    }
    return 0;
  });

  return items;
}

function crearMatriz(matriz, todo) {
  matriz[0] = [];
  matriz[0][0] = "VACIO";
  for (let i = 0; i < todo.length; i++) {
    matriz[i + 1] = [];
    matriz[i + 1][0] = todo[i][0];
    for (let j = 0; j < todo[i][1].length; j++) {
      let pos = matriz[0].indexOf(todo[i][1][j].id);
      if (pos == -1) {
        matriz[0].push(todo[i][1][j].id);
        matriz[i + 1][matriz[0].length - 1] = todo[i][1][j].score;
      } else {
        matriz[i + 1][pos] = todo[i][1][j].score;
      }
    }
  }
  for (let i = 0; i < matriz.length; i++)
    for (let j = 0; j < matriz[0].length; j++)
      if (matriz[i][j] == undefined) matriz[i][j] = 0;
}

function pearsonCorrelation(matriz, pearson) {
  for (let i = 2; i < matriz.length; i++) {
    let numerador = 0;
    let denominador1 = 0;
    let denominador2 = 0;
    for (let j = 1; j < matriz[0].length - 1; j++) {
      if (matriz[1][j] != 0 && matriz[i][j] != 0) {
        numerador +=
          (matriz[1][j] - matriz[1][matriz[1].length - 1]) *
          (matriz[i][j] - matriz[i][matriz[i].length - 1]);
        denominador1 += Math.pow(
          matriz[1][j] - matriz[1][matriz[1].length - 1],
          2
        );
        denominador2 += Math.pow(
          matriz[i][j] - matriz[i][matriz[i].length - 1],
          2
        );
      }
    }
    let sol = numerador / (Math.sqrt(denominador1) * Math.sqrt(denominador2));
    pearson.push({ user: matriz[i][0], score: sol, pos: i });
  }
  pearson.sort(function (a, b) {
    if (a.score > b.score) {
      return -1;
    }
    if (a.score < b.score) {
      return 1;
    }
    return 0;
  });
}

function calculoMedias(matriz) {
  for (let i = 1; i < matriz.length; i++) {
    let contador = 0;
    let suma = 0;
    for (let j = 1; j < matriz[0].length; j++) {
      if (matriz[i][j] != 0) {
        contador++;
        suma += matriz[i][j];
      }
    }
    matriz[i].push(suma / contador);
  }
  matriz[0].push("Media");
}

async function getRatedCars(user) {
  var res = [];
  let query =
    " match (u:User)-[r:RATES]->(c:Car)\
    where u.username = $user\
    return  u.username as userId, collect({id:c.id, score: r.rating}) as rating ";
  const result = await session.run(query, { user });
  result.records.forEach((record) => {
    res.push(record);
  });
  return res;
}
async function getSimilarUsers(user) {
  var res = [];
  let query =
    "match(u:User)-[r:RATES]->(c:Car)\
    where u.username = $user\
    with r,c, collect(c.id) as ids,u\
    match(u1:User)-[r2:RATES]->(c2:Car)\
    where c2.id in ids and u1<>u\
    with u1, count(r2) as cnt\
    with u1,cnt\
    order by cnt desc limit 100\
    match(u1)-[rr:RATES]->(j:Car)\
    return u1.username as userId, collect({id : j.id, score: rr.rating}) as ratings";
  const result = await session.run(query, { user });
  result.records.forEach((record) => {
    res.push(record);
  });
  return res;
}

app.post("/crearUsers", async function (req, res) {
  for (let index = 0; index < 200; index++) {
    await crearUsuario();
  }

  res.send("ok");
});

const generateRandomString = (num) => {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result1 = "";
  const charactersLength = characters.length;
  for (let i = 0; i < num; i++) {
    result1 += characters.charAt(Math.floor(Math.random() * charactersLength));
  }

  return result1;
};

async function crearUsuario() {
  let query =
    "CREATE (u:User { username: $user}) \
    SET u.name = $nombre, u.password = $password";
  let random = generateRandomString(Math.random() * 3 + 3);
  let nombre = random;
  let user = random;
  let password = "12345";
  await session.run(query, { user, nombre, password });
}
app.post("/coches", function (req, res) {
  var respuesta;
  let query = "MATCH (n:Car) RETURN n LIMIT 1";
  session
    .readTransaction((tx) => tx.run(query))
    .then(function (result) {
      console.log(result.records[0]._fields[0].properties.change);

      respuesta = result.records[0]._fields[0].properties;
      res.send(respuesta);
    });
});
async function getAllUsers2() {
  let res = [];
  let query =
    "MATCH (u:User) where u.password = '12345'\
   RETURN u.username as username";
  const result = await session.run(query);
  result.records.forEach((record) => {
    res.push(record);
  });
  return res;
}
app.post("/crearPuntuacion", async function (req, res) {
  let usernames = await getAllUsers2();
  let cars = await getAllCars();
  for (let i = 0; i < usernames.length; i++) {
    let user = usernames[i].get("username");
    if (user == "Ap25") continue;
    let tipo = Math.random();
    for (let j = 0; j < 10; j++) {
      let randomCar = Math.floor(Math.random() * cars.length);
      let car = cars[randomCar];
      let puntuacion = 0;
      if (tipo > 0.5) {
        if (car.get("kms") < 10000 && car.get("change") == "Automatico") {
          puntuacion = 4.5;
        } else if (
          car.get("make") == "LEXUS" ||
          car.get("make") == "MERCEDES-BENZ" ||
          car.get("make") == "	BMW" ||
          car.get("make") == "AUDI" ||
          car.get("make") == "MASERATI" ||
          car.get("make") == "PORSCHE"
        ) {
          puntuacion = 3;
        } else {
          puntuacion = 1;
        }
      } else {
        if (car.get("price") > 25000) {
          puntuacion = 1;
        } else {
          puntuacion = 4;
        }
      }
      await crearRelacion(user, car.get("carId"), puntuacion);
    }
  }

  res.send("ok");
});

async function crearRelacion(user, car, rating) {
  let query =
    "MATCH (u:User), (c:Car)\
  WHERE u.username = $user AND c.id = $car\
  CREATE (u)-[r:RATES]->(c) SET r.rating = $rating";
  await session.run(query, { user, car, rating });
}

async function getAllUsers() {
  let res = [];
  let query = "MATCH (u:User) RETURN u.username as username";
  const result = await session.run(query);
  result.records.forEach((record) => {
    res.push(record);
  });
  return res;
}

//Algoritmo hibrido
function hibrido(lista1, lista2) {
  const pesoContenido = 0.7;
  const pesoColaborativo = 0.3;
  let matriz = [];
  matriz[0] = [];
  matriz[1] = [];
  matriz[2] = [];
  for (let i = 0; i < lista1.length; i++) {
    let pos = matriz[0].indexOf(lista1[i].id);
    if (pos == -1) pos = matriz[0].length;
    matriz[0][pos] = lista1[i].id;
    matriz[1][pos] = lista1[i].similarity;
  }
  for (let i = 0; i < lista2.length; i++) {
    let pos = matriz[0].indexOf(lista2[i].id);
    if (pos == -1) pos = matriz[0].length;
    matriz[0][pos] = lista2[i].id;
    matriz[2][pos] = lista2[i].similarity;
  }
  for (let i = 0; i < matriz[0].length; i++) {
    if (matriz[1][i] == undefined) matriz[1][i] = 0;
    if (matriz[2][i] == undefined) matriz[2][i] = 0;
  }
  let sol = [];
  for (let i = 0; i < matriz[0].length; i++) {
    let sim;
    if (matriz[1][i] == 0) sim = matriz[2][i];
    else if (matriz[2][i] == 0) sim = matriz[1][i];
    else sim = matriz[1][i] * pesoContenido + matriz[2][i] * pesoColaborativo;
    if (sim > 0.5) sol.push({ id: matriz[0][i], similarity: sim });
  }
  sol.sort(function (a, b) {
    if (a.similarity > b.similarity) {
      return -1;
    }
    if (a.similarity < b.similarity) {
      return 1;
    }
    return 0;
  });
  return sol;
}
