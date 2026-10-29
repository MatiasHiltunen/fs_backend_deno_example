<!-- src2md:v1 -->

## 00-kieli\kieli.ts

```typescript
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
```

## async_example.ts

```typescript
import {readdir, readFile} from "node:fs/promises"
import { DOMParser, Element } from "jsr:@b-fuze/deno-dom";

const files = await readdir("./")

let html: string = ""

// Haetaan ruokalista devatessa vain kerran verkon yli, jotta ei rasiteta palvelinta liikaa.
// Muutoin luetaan tallennettu html-tiedosto, jos se on jo olemassa.
if(files.includes("parsed.html")) {
    html = await readFile("parsed.html", {encoding: "utf-8"})
} else {

    const url = new URL("https://www.compass-group.fi/ravintolat-ja-ruokalistat/foodco/kaupungit/rovaniemi/lapin-amk-tekuila-ja-cafe-lumen/")
    
    const response = await fetch(url)
    html = await response.text()
    
    await Deno.writeTextFile("parsed.html", html)
}

const parse = new DOMParser()
const doc = parse.parseFromString(html, "text/html")


export interface Root {
  "@context": string
  "@type": string
  name: string
  "@id": string
  image: string
  url: string
  email: string
  telephone: string
  address: Address
  geo: Geo
  openingHoursSpecification: OpeningHoursSpecification[]
  hasMenu: HasMenu
}

export interface Address {
  "@type": string
  streetAddress: string
  addressLocality: string
  postalCode: string
  addressCountry: string
}

export interface Geo {
  "@type": string
  latitude: number
  longitude: number
}

export interface OpeningHoursSpecification {
  "@type": string
  dayOfWeek: string
  opens: string
  closes: string
}

export interface HasMenu {
  "@type": string
  name: string
  hasMenuSection: HasMenuSection[]
}

export interface HasMenuSection {
  "@type": string
  validFrom: string
  validThrough: string
  hasMenuSection: HasMenuSection2[]
}

export interface HasMenuSection2 {
  "@type": string
  name: string
  hasMenuItem: HasMenuItem[]
}

export interface HasMenuItem {
  "@type": string
  name: string
  description: string
  suitableForDiet?: string[]
}


const jsonData = doc.head.getElementById("restaurant-structured-data")?.textContent.trim() || ""



const data = JSON.parse(jsonData) as Root

/*  ],
  "hasMenu": {
    "@type": "Menu",
    "name": "Lunch menu",
    "hasMenuSection": [
      {
        "@type": "MenuSection",
        "validFrom": "2026-10-19",
        "validThrough": "2026-10-19",
        "hasMenuSection": [
          {
            "@type": "MenuSection",
            "name": "Vegaaninen kasvislounas ",
            "hasMenuItem": [
              {
                "@type": "MenuItem",
                "name": "Makean hapanta tofu-kasviswokkia - Tofua Kung Pao",
                "suitableForDiet": [
                  "https://schema.org/GlutenFreeDiet",
                  "https://schema.org/VeganDiet"
                ],
                "description": "*, A, G, ILM, L, M, Veg, VS"
              },
              {
                "@type": "MenuItem",
                "name": "Tummaa riisiä",
                "suitableForDiet": [
                  "https://schema.org/GlutenFreeDiet",
                  "https://schema.org/VeganDiet"
                ],
                "description": "*, G, L, M, Veg"
              }
            ]
          }, */

const menuSections = data.hasMenu.hasMenuSection



console.log(data.hasMenu.name)

for (const section of menuSections) {
    console.log("\n\n")
    console.log(new Date(section.validThrough).toLocaleDateString("fi-FI", { weekday: "long", day: "numeric", month: "long" }))
    console.log("================================")
    const subSections = section.hasMenuSection
    for (const subSection of subSections) {

        console.log(subSection.name)

        subSection.hasMenuItem.forEach((item) => {
            console.log(item.name)
            console.log(item.description)
        })
    }

}

//console.log(menuSections[0].hasMenuSection[0].hasMenuItem[0].name)


/* Deno.writeTextFile("parsed.json", JSON.stringify(data, null, 2)) */
```

## deno.json

```json
{
  "tasks": {
    "dev": "deno run --watch --allow-net main.ts"
  },
  "imports": {
    "@std/assert": "jsr:@std/assert@1"
  }
}

```

## hello.ts

```typescript
const test = "Hello, world!"

console.log(test)
```

## main.ts

```typescript
export function handler(req: Request): Response {
  const url = new URL(req.url);

  if (url.pathname === "/api") {
    return Response.json({
      message: "Hello, world!",
      time: new Date().toISOString(),
    });
  }

  return new Response("<h1>Welcome to Deno!</h1>", {
    headers: { "content-type": "text/html" },
  });
}

if (import.meta.main) {
  Deno.serve(handler);
}

```

## main_test.ts

```typescript
import { assertEquals } from "@std/assert";
import { handler } from "./main.ts";

Deno.test("returns html on /", async () => {
  const res = handler(new Request("http://localhost/"));
  assertEquals(res.headers.get("content-type"), "text/html");
  const body = await res.text();
  assertEquals(body.includes("Welcome to Deno"), true);
});

Deno.test("returns json on /api", async () => {
  const res = handler(new Request("http://localhost/api"));
  const data = await res.json();
  assertEquals(data.message, "Hello, world!");
  assertEquals(typeof data.time, "string");
});

```

## server.ts

```typescript
Deno.serve((_req) => {
  return new Response("Hello, World!");
});
```

