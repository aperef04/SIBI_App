function Prueba(nav,total) {
  for (let i = 1; i <= total; i++) {
    if (i == nav) {
      document.getElementById("nav" + nav).className = "nav-link active";
      document.getElementById("coche" + nav).className = "card-body";
    } else {
      document.getElementById("nav" + i).className = "nav-link";
      document.getElementById("coche" + i).className = "card-body d-none";
    }
  }
}

function Puntua(num) {
  const valores = window.location.search;
  const urlParams = new URLSearchParams(valores);
  let a = 0;
  let user = urlParams.get('user')
  for (let index = 5; index > 0; index--) {
    if (document.getElementById("star" + index + "-" + num).checked) {
      a = index;
      break;
    }
  }
  let coche;
  coche = document.getElementById("boton" + num).className;
  $.post("./rate", { rating: parseInt(a), carId:parseInt(coche),user:user });
  document.getElementById("botonBuscar").disabled = false;
}

function buscar(){
  const valores = window.location.search;
  const urlParams = new URLSearchParams(valores);
  let user = urlParams.get('user')
  window.location.href = "./recomendaciones?user="+user
}

function buscarMarcas(){
  const valores = window.location.search;
  const urlParams = new URLSearchParams(valores);
  let user = urlParams.get('user')
  let marca = document.getElementById("marcas").value;
  window.location.href = "./marca?user="+user+"&marca="+marca
}

function puntuados(){
  const valores = window.location.search;
  const urlParams = new URLSearchParams(valores);
  let user = urlParams.get('user')
  window.location.href = "./puntuados?user="+user
}