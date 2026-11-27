
// =====================================
// SAFEHER - MAIN JAVASCRIPT
// =====================================

// 1. INITIALIZE MAP

const map = L.map("map").setView([11.0168, 76.9558], 9);

L.tileLayer(
    "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
    {
        attribution: "&copy; OpenStreetMap contributors"
    }
).addTo(map);

let routeLayer = null;
let routeMarkers = [];
let placeMarkers = [];
let allPlaces = [];

const form = document.getElementById("routeForm");
const statusText = document.getElementById("status");
const results = document.getElementById("results");
const searchBtn = document.getElementById("searchBtn");
const placeFilter = document.getElementById("placeFilter");


// 2. SEARCH LOCATION

async function getLocation(place) {

    const url =
        "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q="
        + encodeURIComponent(place);

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error("Location search service unavailable.");
    }

    const data = await response.json();

    if (!data.length) {
        throw new Error("Location not found: " + place);
    }

    return {
        lat: Number(data[0].lat),
        lon: Number(data[0].lon),
        name: data[0].display_name
    };
}


// 3. CLEAR OLD MAP DATA

function clearMap() {

    if (routeLayer) {
        map.removeLayer(routeLayer);
        routeLayer = null;
    }

    routeMarkers.forEach(marker => map.removeLayer(marker));
    routeMarkers = [];

    placeMarkers.forEach(marker => map.removeLayer(marker));
    placeMarkers = [];

    allPlaces = [];
}


// 4. SELECT POINTS ALONG ROUTE

function sampleRoute(coords) {

    const points = [];

    if (!coords.length) return points;

    const count = Math.min(12, coords.length);

    for (let i = 0; i < count; i++) {

        const index = Math.round(
            i * (coords.length - 1) / (count - 1 || 1)
        );

        points.push(coords[index]);
    }

    return points;
}


// 5. FIND NEARBY PLACES

async function findNearbyPlaces(coords) {

    const samples = sampleRoute(coords);
    const queryParts = [];

    samples.forEach(point => {

        const lat = point[1];
        const lon = point[0];

        queryParts.push(`
            nwr(around:3500,${lat},${lon})
            ["amenity"~"hospital|police|restaurant|cafe|fuel"];

            nwr(around:3500,${lat},${lon})
            ["shop"="car_repair"];
        `);
    });

    const query = `
        [out:json][timeout:60];
        (
            ${queryParts.join("")}
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
                body: new URLSearchParams({
                    data: query
                })
            });

            if (!response.ok) continue;

            const data = await response.json();

            if (Array.isArray(data.elements)) {
                return data.elements;
            }

        } catch (error) {
            console.log("Overpass server unavailable:", error);
        }
    }

    throw new Error("Nearby places service is temporarily unavailable.");
}


// 6. IDENTIFY PLACE CATEGORY

function getPlaceType(tags) {

    if (tags.amenity === "hospital") return "Hospital";

    if (tags.amenity === "police") return "Police Station";

    if (tags.amenity === "restaurant") return "Restaurant";

    if (tags.amenity === "cafe") return "Cafe";

    if (tags.amenity === "fuel") return "Fuel Station";

    if (tags.shop === "car_repair") return "Vehicle Service";

    return "Other";
}


// 7. DISPLAY PLACES

function showPlaces(places) {

    const uniquePlaces = new Map();

    places.forEach(place => {

        const tags = place.tags || {};
        const type = getPlaceType(tags);

        if (type === "Other") return;

        const lat = place.lat ?? place.center?.lat;
        const lon = place.lon ?? place.center?.lon;

        if (lat == null || lon == null) return;

        const key = `${place.type}-${place.id}`;

        uniquePlaces.set(key, {
            id: key,
            name: tags.name || "Name not available",
            type: type,
            lat: lat,
            lon: lon,
            hours: tags.opening_hours || "Not available",
            phone: tags.phone ||
                   tags["contact:phone"] ||
                   "Not available",
            address: [
                tags["addr:street"],
                tags["addr:city"]
            ].filter(Boolean).join(", ") || "Not listed"
        });
    });

    allPlaces = Array.from(uniquePlaces.values());

    renderPlaces();
}


// 8. FILTER AND DISPLAY RESULTS

function renderPlaces() {

    results.innerHTML = "";

    placeMarkers.forEach(marker => map.removeLayer(marker));
    placeMarkers = [];

    const selected = placeFilter.value;

    const filtered = allPlaces.filter(place => {

        return selected === "All" ||
               place.type === selected;
    });

    document.getElementById("placeCount").textContent =
        filtered.length + " mapped places found";

    if (filtered.length === 0) {

        results.textContent =
            "No mapped places found in this category. Try another category or check again later.";

        return;
    }

    filtered.forEach(place => {

        const card = document.createElement("div");
        card.className = "place-card";

        const heading = document.createElement("h3");
        heading.textContent = place.name;

        const category = document.createElement("p");
        category.textContent = "Category: " + place.type;

        const address = document.createElement("p");
        address.textContent = "Address: " + place.address;

        const hours = document.createElement("p");
        hours.textContent = "Opening hours: " + place.hours;

        const phone = document.createElement("p");
        phone.textContent = "Phone: " + place.phone;

        const link = document.createElement("a");

        link.href =
            `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lon}#map=17/${place.lat}/${place.lon}`;

        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = "View Location";

        card.append(
            heading,
            category,
            address,
            hours,
            phone,
            link
        );

        results.appendChild(card);

        const marker = L.marker([place.lat, place.lon])
            .addTo(map);

        const popup = document.createElement("div");
        const popupTitle = document.createElement("strong");
        popupTitle.textContent = place.name;

        const popupCategory = document.createElement("p");
        popupCategory.textContent = place.type;

        popup.append(popupTitle, popupCategory);
        marker.bindPopup(popup);

        placeMarkers.push(marker);
    });
}


// 9. CATEGORY FILTER EVENT

placeFilter.addEventListener("change", renderPlaces);


// 10. FIND ROUTE AND PLACES

form.addEventListener("submit", async function(event) {

    event.preventDefault();

    const origin =
        document.getElementById("origin").value.trim();

    const destination =
        document.getElementById("destination").value.trim();

    if (!origin || !destination) return;

    searchBtn.disabled = true;
    searchBtn.textContent = "Searching...";

    statusText.textContent =
        "Finding your locations and route...";

    results.textContent = "Searching nearby places...";

    document.getElementById("distance").textContent = "--";
    document.getElementById("duration").textContent = "--";
    document.getElementById("placeCount").textContent = "";

    clearMap();

    try {

        // Find starting point

        const start = await getLocation(origin);

        // Find destination

        const end = await getLocation(destination);

        // Get driving route

        const routeURL =
            `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=full&geometries=geojson`;

        const routeResponse = await fetch(routeURL);

        if (!routeResponse.ok) {
            throw new Error("Route service unavailable.");
        }

        const routeData = await routeResponse.json();

        if (!routeData.routes || !routeData.routes.length) {
            throw new Error("No driving route found.");
        }

        const route = routeData.routes[0];

        const coords = route.geometry.coordinates;

        // Draw route

        routeLayer = L.geoJSON(route.geometry, {
            style: {
                color: "#087f8c",
                weight: 5
            }
        }).addTo(map);

        // Starting marker

        routeMarkers.push(
            L.marker([start.lat, start.lon])
                .addTo(map)
                .bindPopup("Starting Location")
        );

        // Destination marker

        routeMarkers.push(
            L.marker([end.lat, end.lon])
                .addTo(map)
                .bindPopup("Destination")
        );

        map.fitBounds(routeLayer.getBounds(), {
            padding: [30, 30]
        });

        // Display journey details

        document.getElementById("distance").textContent =
            (route.distance / 1000).toFixed(1) + " km";

        const totalMinutes = Math.round(route.duration / 60);

        const hours = Math.floor(totalMinutes / 60);
        const minutes = totalMinutes % 60;

        document.getElementById("duration").textContent =
            hours + " hr " + minutes + " min";

        // Search places

        statusText.textContent =
            "Route found! Searching for nearby facilities...";

        const places = await findNearbyPlaces(coords);

        showPlaces(places);

        statusText.textContent =
            "Route and nearby facilities loaded successfully.";

    } catch (error) {

        statusText.textContent = error.message;

        results.textContent =
            "Unable to load journey information. Please try again.";

        console.error(error);

    } finally {

        searchBtn.disabled = false;
        searchBtn.textContent = "Find My Safe Route";
    }

});


// END OF SAFEHER JAVASCRIPT
