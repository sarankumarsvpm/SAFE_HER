
const map = L.map("map").setView([11.0168, 76.9558], 9);

L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; OpenStreetMap contributors'
}).addTo(map);

let routeLayer;
let markers = [];

const form = document.getElementById("routeForm");
const statusText = document.getElementById("status");
const results = document.getElementById("results");

async function getLocation(place) {
    const url = "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&q="
        + encodeURIComponent(place);

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error("Location search failed.");
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

function clearMarkers() {
    markers.forEach(marker => map.removeLayer(marker));
    markers = [];

    if (routeLayer) {
        map.removeLayer(routeLayer);
    }
}

function sampleRoute(coords) {
    const count = Math.min(8, Math.max(2, Math.ceil(coords.length / 100)));
    const points = [];

    for (let i = 0; i < count; i++) {
        const index = Math.round(
            i * (coords.length - 1) / (count - 1)
        );
        points.push(coords[index]);
    }

    return points;
}

async function findNearbyPlaces(coords) {
    const samples = sampleRoute(coords);

    const categories = [
        ['amenity', 'hospital'],
        ['amenity', 'police'],
        ['amenity', 'restaurant'],
        ['amenity', 'cafe'],
        ['amenity', 'fuel'],
        ['shop', 'car_repair']
    ];

    let queryParts = [];

    samples.forEach(point => {
        const lat = point[1];
        const lon = point[0];

        categories.forEach(([key, value]) => {
            queryParts.push(
                `node(around:5000,${lat},${lon})["${key}"="${value}"];`
            );
            queryParts.push(
                `way(around:5000,${lat},${lon})["${key}"="${value}"];`
            );
            queryParts.push(
                `relation(around:5000,${lat},${lon})["${key}"="${value}"];`
            );
        });
    });

    const query = `[out:json][timeout:60];(${queryParts.join("")});out center tags;`;

    const response = await fetch(
        "https://overpass-api.de/api/interpreter",
        {
            method: "POST",
            body: new URLSearchParams({ data: query })
        }
    );

    if (!response.ok) {
        throw new Error("Nearby place service is temporarily unavailable.");
    }

    const data = await response.json();
    return data.elements || [];
}

function getPlaceType(tags) {
    if (tags.amenity === "hospital") return "Hospital";
    if (tags.amenity === "police") return "Police Station";
    if (tags.amenity === "restaurant") return "Restaurant";
    if (tags.amenity === "cafe") return "Cafe / Rest Stop";
    if (tags.amenity === "fuel") return "Fuel Station";
    if (tags.shop === "car_repair") return "Vehicle Service";
    return "Other";
}

function showPlaces(places) {
    results.innerHTML = "";

    const seen = new Set();
    let count = 0;

    places.forEach(place => {
        const tags = place.tags || {};
        const lat = place.lat ?? place.center?.lat;
        const lon = place.lon ?? place.center?.lon;

        if (lat == null || lon == null) return;

        const key = place.type + "-" + place.id;
        if (seen.has(key)) return;
        seen.add(key);

        const name = tags.name || "Name not available";
        const type = getPlaceType(tags);

        const card = document.createElement("div");
        card.className = "place-card";

        const heading = document.createElement("h3");
        heading.textContent = name;

        const category = document.createElement("p");
        category.textContent = "Category: " + type;

        const address = document.createElement("p");
        address.textContent = tags["addr:city"] || "Address not listed";

        const link = document.createElement("a");
        link.href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lon}#map=17/${lat}/${lon}`;
        link.target = "_blank";
        link.rel = "noopener";
        link.textContent = "View Location";

        card.append(heading, category, address, link);
        results.appendChild(card);

        const marker = L.marker([lat, lon])
            .addTo(map)
            .bindPopup(`<b>${name.replace(/[&<>"']/g, "")}</b><br>${type}`);

        markers.push(marker);
        count++;
    });

    if (count === 0) {
        results.textContent =
            "No mapped facilities were found along this route. Try another route or check again later.";
    }
}

form.addEventListener("submit", async function(event) {
    event.preventDefault();

    const origin = document.getElementById("origin").value.trim();
    const destination = document.getElementById("destination").value.trim();
    const button = document.getElementById("searchBtn");

    if (!origin || !destination) return;

    button.disabled = true;
    button.textContent = "Searching...";
    statusText.textContent = "Finding locations and calculating your route...";
    results.textContent = "Loading nearby places...";

    try {
        const start = await getLocation(origin);
        const end = await getLocation(destination);

        const routeURL =
            `https://router.project-osrm.org/route/v1/driving/${start.lon},${start.lat};${end.lon},${end.lat}?overview=full&geometries=geojson`;

        const routeResponse = await fetch(routeURL);

        if (!routeResponse.ok) {
            throw new Error("Route service is unavailable.");
        }

        const routeData = await routeResponse.json();

        if (!routeData.routes || !routeData.routes.length) {
            throw new Error("No driving route found.");
        }

        const route = routeData.routes[0];
        const coords = route.geometry.coordinates;

        clearMarkers();

        routeLayer = L.geoJSON(route.geometry, {
            style: {
                color: "#087f8c",
                weight: 5
            }
        }).addTo(map);

        L.marker([start.lat, start.lon])
            .addTo(map)
            .bindPopup("Starting Location")
            .openPopup();

        L.marker([end.lat, end.lon])
            .addTo(map)
            .bindPopup("Destination");

        map.fitBounds(routeLayer.getBounds(), { padding: [25, 25] });

        document.getElementById("distance").textContent =
            "Distance: " + (route.distance / 1000).toFixed(1) + " km";

        document.getElementById("duration").textContent =
            "Estimated Time: " + (route.duration / 3600).toFixed(1) + " hours";

        statusText.textContent = "Route found! Searching for nearby facilities...";

        const places = await findNearbyPlaces(coords);
        showPlaces(places);

        statusText.textContent =
            "Journey route and nearby facilities loaded successfully.";

    } catch (error) {
        statusText.textContent = error.message;
        results.textContent =
            "Unable to load all journey information. Please try again later.";
    } finally {
        button.disabled = false;
        button.textContent = "Find My Route";
    }
});
