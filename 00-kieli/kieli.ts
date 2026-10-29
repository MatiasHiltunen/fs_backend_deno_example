// Tämä tiedosto suoritetaan Denossa, ei selaimessa. .ts tarkoittaa TypeScriptiä.
// Kaksi kauttaviivaa aloittaa kommentin: Deno ei suorita kommentin tekstiä.

// const antaa arvolle nimen. Kaksoispisteen string tarkoittaa tekstiä.
const nimi: string = "Aino";

// number tarkoittaa lukua. Luvun ympärille ei kirjoiteta lainausmerkkejä.
const tavoite: number = 3;

// let sallii muuttujan arvon vaihtamisen myöhemmin.
let tehty: number = 1;

// = sijoittaa uuden arvon; + laskee yhteen kaksi lukua.
tehty = tehty + 1;
// boolean on totuusarvo: true on tosi ja false on epätosi.
const valmis: boolean = tehty === tavoite;
// console.log kirjoittaa sulkeissa olevat arvot terminaaliin.
console.log("Opiskelija:", nimi);
// Pilkut erottavat toisistaan saman funktion argumentit eli syötteet.
console.log("Tehty:", tehty, "Tavoite:", tavoite, "Valmis:", valmis);

// type antaa tietomuodolle nimen; tässä olion nimi on Tehtava.
type Tehtava = {
  // id on tehtävän yksilöllinen numero, jonka tyyppi on number.
  id: number;
  // otsikko on tehtävän sisältö tekstinä.
  otsikko: string;
  // valmis kertoo totuusarvolla, onko tehtävä tehty.
  valmis: boolean;
}; // Aaltosulku päättää olion tyyppikuvauksen, puolipiste päättää määrittelyn.

// Hakasulut [] merkitsevät taulukkoa eli järjestettyä joukkoa arvoja.
const tehtavat: Tehtava[] = [
  // Aaltosulkujen sisällä on yksi olio, jonka kentillä on nimet ja arvot.
  { id: 1, otsikko: "Avaa terminaali", valmis: true },
  // Tämä toinen olio noudattaa samaa Tehtava-tyyppiä.
  { id: 2, otsikko: "Käynnistä palvelin", valmis: false },
  { id: 3, otsikko: "Käynnistä palvelin", valmis: false },
]; // Hakasulku päättää taulukon.

/* const data:string = tehtavat[2].sisalto ?? "Ei lisättyä sisältöä"

console.log(data) */

// function määrittelee uudelleen käytettävän toiminnon nimeltä muodostaRivi.
// Parametri tehtava saa yhden Tehtava-olion; viimeinen string on paluuarvon tyyppi.
function muodostaRivi(tehtava: Tehtava): string {
  // if suorittaa lohkon vain silloin, kun sulkeiden ehto on tosi.
  if (tehtava.valmis) {
    // return palauttaa vastauksen ja lopettaa tämän funktion suorituksen.
    return tehtava.otsikko + " — tehty";
  } // Tähän päättyy ehdollinen lohko.
  // Tähän saavutaan vain, jos tehtävä ei ollut valmis.
  return tehtava.otsikko + " — kesken";
} // Tähän päättyy funktion määrittely.

// for...of käy taulukon arvot läpi yksi kerrallaan.
for (const tehtava of tehtavat) {
  // Funktiota kutsutaan sen nimellä ja sulkeilla; tehtava annetaan syötteeksi.
  console.log(muodostaRivi(tehtava));
} // Silmukan lohko päättyy; seuraava kierros ottaa seuraavan tehtävän.

// Nuolifunktio on lyhyempi tapa kirjoittaa funktio; => erottaa syötteen ja työn.
// filter tekee uuden taulukon arvoista, joille funktio palauttaa true.
// Huutomerkki ! kääntää totuusarvon: !false on true.
const keskeneraiset = tehtavat.filter((tehtava) => !tehtava.valmis);

// length kertoo taulukon alkioiden lukumäärän.
console.log("Keskeneräisiä:", keskeneraiset.length);

// unknown tarkoittaa arvoa, jonka muotoa emme vielä tiedä.
const ulkoinenArvo: unknown = "  Opi lisää  ";
// typeof tarkistaa arvon tyypin ohjelman ollessa käynnissä.
if (typeof ulkoinenArvo === "string") {
  // Vasta tarkistuksen jälkeen voimme turvallisesti käyttää tekstin trim-metodia.
  // trim poistaa tekstin alusta ja lopusta tyhjät merkit.
  console.log("Siistitty otsikko:", ulkoinenArvo.trim());
} // Ajonaikaisen tarkistuksen lohko päättyy.

// async kertoo, että funktio palauttaa lupauksen eli Promisen.
// Promise<string> lupaa valmistuessaan merkkijonon.
async function tervehdi(): Promise<string> {
  // Promise.resolve luo heti valmistuvan lupauksen; tässä ei tehdä verkkopyyntöä.
  // await odottaa tulosta jatkamatta tämän funktion seuraavalle riville ennen sitä.
  const tervehdys = await Promise.resolve("Perusteet toimivat!");
  // async-funktion palauttama arvo päätyy lupauksen tulokseksi.
  return tervehdys;
} // Funktion lohko päättyy.

// Deno sallii await-sanan moduulin ylimmällä tasolla eli myös funktioiden ulkopuolella.
console.log(await tervehdi());