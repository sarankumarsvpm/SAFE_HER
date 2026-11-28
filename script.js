// ----------------------------------
// SAFEHER MAP
// ----------------------------------

const map = L.map("map").setView([11.0168, 76.9558], 8);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
  attribution: "&copy; OpenStreetMap contributors"
}).addTo(map);

let routeLayer = null;
let placeMarkers = [];
let allPlaces = [];

const routeForm = document.getElementById("routeForm");
const statusText = document.getElementById("status");
const placesList = document.getElementById("placesList");
const placeFilter = document.getElementById("placeFilter");
const placeCount = document.getElementById("placeCount");
const searchButton = document.getElementById("searchButton");


// ----------------------------------
// GET LOCATION COORDINATES
// ----------------------------------

async function getCoordinates(locationName) {
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q=" +
    encodeURIComponent(locationName);

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Location search failed.");
  }

  const data = await response.json();

  if (!data.length) {
    throw new Error("Location not found: " + locationName);
  }

  return [
    Number(data[0].lon),
    Number(data[0].lat)
  ];
}


// ----------------------------------
// GET DRIVING ROUTE
// ----------------------------------

async function getRoute(start, destination) {
  const url =
    `https://router.project-osrm.org/route/v1/driving/` +
    `${start[0]},${start[1]};${destination[0]},${destination[1]}` +
    "?overview=full&geometries=geojson";

  const response = await fetch(url);

  if (!response.ok) {
    throw new Error("Route service is unavailable.");
  }

  const data = await response.json();

  if (data.code !== "Ok" || !data.routes.length) {
    throw new Error("No driving route found.");
  }

  return data.routes[0];
}


// ----------------------------------
// GET POINTS ALONG THE ROUTE
// ----------------------------------

function getRouteSamples(coordinates) {
  const samples = [];
  const count = Math.min(8, coordinates.length);

  for (let i = 0; i < count; i++) {
    const index = Math.round(
      i * (coordinates.length - 1) / Math.max(1, count - 1)
    );

    samples.push(coordinates[index]);
  }

  return samples;
}


// ----------------------------------
// GET PLACES FROM OPENSTREETMAP
// ----------------------------------

async function getPlaces(coordinates) {
  const samples = getRouteSamples(coordinates);

  const searches = samples.map(([lon, lat]) => {
    return `
      nwr(around:3000,${lat},${lon})
        ["amenity"~"^(restaurant|cafe|hospital|police)$"];

      nwr(around:3000,${lat},${lon})
        ["shop"~"^(car_repair|vehicle|tyres|car_parts)$"];
    `;
  }).join("\n");

  const query = `
    [out:json][timeout:60];
    (
      ${searches}
    );
    out center tags;
  `;

  const servers = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter"
  ];

  for (const server of servers) {
    try {
      const response = await fetch(server, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        },
        body: "data=" + encodeURIComponent(query)
      });

      if (!response.ok) {
        continue;
      }

      const data = await response.json();
      return data.elements || [];

    } catch (error) {
      console.log("Trying another map data server...");
    }
  }

  throw new Error("Place search is temporarily unavailable. Please try again.");
}


// ----------------------------------
// IDENTIFY PLACE CATEGORY
// ----------------------------------

function getPlaceType(tags) {
  if (tags.amenity === "restaurant") {
    return "restaurant";
  }

  if (tags.amenity === "cafe") {
    return "cafe";
  }

  if (tags.amenity === "hospital") {
    return "hospital";
  }

  if (tags.amenity === "police") {
    return "police";
  }

  if (
    ["car_repair", "vehicle", "tyres", "car_parts"].includes(tags.shop)
  ) {
    return "mechanic";
  }

  return null;
}


// ----------------------------------
// CATEGORY DISPLAY NAMES
// ----------------------------------

function getCategoryName(type) {
  const names = {
    restaurant: "Restaurant",
    cafe: "Cafe",
    hospital: "Hospital",
    police: "Police Station",
    mechanic: "Mechanic / Vehicle Shop"
  };

  return names[type] || "Other";
}


// ----------------------------------
// PREPARE PLACE DETAILS
// ----------------------------------

function preparePlaces(elements) {
  const uniquePlaces = new Map();

  elements.forEach(element => {
    const tags = element.tags || {};
    const type = getPlaceType(tags);

    if (!type) return;

    const latitude = element.lat ?? element.center?.lat;
    const longitude = element.lon ?? element.center?.lon;

    if (latitude == null || longitude == null) return;

    const name =
      tags.name ||
      tags["name:en"] ||
      tags.brand ||
      tags.operator ||
      "Unnamed " + getCategoryName(type);

    const place = {
      id: `${element.type}-${element.id}`,
      name: name,
      type: type,
      latitude: Number(latitude),
      longitude: Number(longitude),
      address: [
        tags["addr:housenumber"],
        tags["addr:street"],
        tags["addr:suburb"],
        tags["addr:city"]
      ].filter(Boolean).join(", "),
      phone: tags.phone || tags["contact:phone"] || "",
      openingHours: tags.opening_hours || ""
    };

    uniquePlaces.set(place.id, place);
  });

  return Array.from(uniquePlaces.values());
}


// ----------------------------------
// DISPLAY PLACES ON MAP
// ----------------------------------

function showPlaceMarkers(places) {
  placeMarkers.forEach(marker => map.removeLayer(marker));
  placeMarkers = [];

  places.forEach(place => {
    const marker = L.marker([
      place.latitude,
      place.longitude
    ]).addTo(map);

    marker.bindPopup(`
      <strong>${escapeHTML(place.name)}</strong><br>
      ${escapeHTML(getCategoryName(place.type))}
    `);

    placeMarkers.push(marker);
  });
}


// ----------------------------------
// DISPLAY PLACE CARDS
// ----------------------------------

function escapeHTML(value) {
  return String(value).replace(/[&<>"']/g, character => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[character]);
}

function renderPlaces() {
  const selectedType = placeFilter.value;

  const filteredPlaces = selectedType === "all"
    ? allPlaces
    : allPlaces.filter(place => place.type === selectedType);

  placesList.innerHTML = "";

  placeCount.textContent =
    `${filteredPlaces.length} places found`;

  if (filteredPlaces.length === 0) {
    placesList.innerHTML =
      "<p>No mapped places found in this category along the searched route.</p>";

    showPlaceMarkers([]);
    return;
  }

  filteredPlaces.forEach(place => {
    const card = document.createElement("div");
    card.className = "place-card";

    const name = document.createElement("h3");
    name.textContent = place.name;

    const category = document.createElement("span");
    category.className = "place-type";
    category.textContent = getCategoryName(place.type);

    card.appendChild(category);
    card.appendChild(name);

    if (place.address) {
      const address = document.createElement("p");
      address.textContent = "Address: " + place.address;
      card.appendChild(address);
    }

    if (place.phone) {
      const phone = document.createElement("p");
      phone.textContent = "Phone: " + place.phone;
      card.appendChild(phone);
    }

    if (place.openingHours) {
      const hours = document.createElement("p");
      hours.textContent = "Opening hours: " + place.openingHours;
      card.appendChild(hours);
    }

    const mapLink = document.createElement("a");
    mapLink.href =
      `https://www.openstreetmap.org/?mlat=${place.latitude}` +
      `&mlon=${place.longitude}#map=17/${place.latitude}/${place.longitude}`;

    mapLink.target = "_blank";
    mapLink.rel = "noopener noreferrer";
    mapLink.textContent = "View on map";

    card.appendChild(mapLink);
    placesList.appendChild(card);
  });

  showPlaceMarkers(filteredPlaces);
}


// ----------------------------------
// FILTER CATEGORIES
// ----------------------------------

placeFilter.addEventListener("change", renderPlaces);


// ----------------------------------
// SEARCH AND DISPLAY JOURNEY
// ----------------------------------

routeForm.addEventListener("submit", async function(event) {
  event.preventDefault();

  const startName = document.getElementById("start").value.trim();
  const destinationName =
    document.getElementById("destination").value.trim();

  if (!startName || !destinationName) {
    statusText.textContent = "Please enter both locations.";
    return;
  }

  searchButton.disabled = true;
  searchButton.textContent = "Searching...";
  statusText.textContent = "Finding your route...";

  placesList.innerHTML = "<p>Searching for places...</p>";
  placeCount.textContent = "Searching...";
  allPlaces = [];
  showPlaceMarkers([]);

  document.getElementById("distance").textContent = "--";
  document.getElementById("duration").textContent = "--";

  try {
    // Find starting and destination coordinates
    const start = await getCoordinates(startName);
    const destination = await getCoordinates(destinationName);

    statusText.textContent = "Calculating your driving route...";

    // Get driving route
    const route = await getRoute(start, destination);

    // Draw route on map
    if (routeLayer) {
      map.removeLayer(routeLayer);
    }

    routeLayer = L.geoJSON(route.geometry, {
      style: {
        color: "#087f8c",
        weight: 5
      }
    }).addTo(map);

    map.fitBounds(routeLayer.getBounds(), {
      padding: [25, 25]
    });

    // Show distance and time
    document.getElementById("distance").textContent =
      (route.distance / 1000).toFixed(1) + " km";

    const totalMinutes = Math.round(route.duration / 60);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;

    document.getElementById("duration").textContent =
      hours > 0
        ? `${hours} hr ${minutes} min`
        : `${minutes} min`;

    statusText.textContent = "Finding places along your route...";

    // Find nearby mapped places
    const elements = await getPlaces(route.geometry.coordinates);

    allPlaces = preparePlaces(elements);

    renderPlaces();

    statusText.textContent =
      "Route and mapped places loaded successfully!";

  } catch (error) {
    console.error(error);

    statusText.textContent =
      error.message || "Something went wrong. Please try again.";

    placesList.innerHTML =
      "<p>Unable to load places. Please try again later.</p>";

    placeCount.textContent = "Places unavailable.";

  } finally {
    searchButton.disabled = false;
    searchButton.textContent = "Find My Route";
  }
});
