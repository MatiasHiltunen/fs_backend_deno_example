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

const menuSections = data.hasMenu.hasMenuSection

console.log(data.hasMenu.name)

for (const section of menuSections) {
    console.log("\n\n")

    const datetime = Temporal.PlainDate.from(section.validFrom)

    console.log(datetime.toPlainDateTime().toLocaleString("fi-FI", { dateStyle: "full" }))

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