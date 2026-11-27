
// SAFEHER SMART TRAVEL PLANNER

let map;
let routeLayer;
let facilityLayer;
let routeFacilities = [];
let selectedFilter = "all";

// Initialize map
function initializeMap() {
    if (map) return;

    map = L.map("map").setView([11.0168, 76.9558], 7);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
    }).addTo(map);

    routeLayer = L.layerGroup().addTo(map);
    facilityLayer = L.layerGroup().addTo(map);
}

initializeMap();

// Convert location name into coordinates
async function getCoordinates(place) {
    const coordinateMatch = place.trim().match(
        /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/
    );

    if (coordinateMatch) {
        return {
            lat: Number(coordinateMatch[1]),
            lon: Number(coordinateMatch[2]),
            name: "Current location"
        };
    }

    const url =
        "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&country=India&q=" +
        encodeURIComponent(place);

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error("Location search is unavailable.");
    }

    const results = await response.json();

    if (!results.length) {
        throw new Error("Location not found in India. Check the spelling.");
    }

    return {
        lat: Number(results[0].lat),
        lon: Number(results[0].lon),
        name: results[0].display_name
    };
}

// Get current GPS location
function useCurrentLocation() {
    const status = document.getElementById("routeStatus");

    if (!navigator.geolocation) {
        status.textContent = "Your browser does not support location.";
        return;
    }

    status.textContent = "Getting your current location...";

    navigator.geolocation.getCurrentPosition(
        function(position) {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            document.getElementById("startLocation").value =
                lat + ", " + lon;

            status.textContent =
                "Current location added. Enter your destination.";
        },
        function() {
            status.textContent =
                "Location unavailable. Please allow browser permission.";
        }
    );
}

// Find road route
async function findSafeRoute() {
    const start = document.getElementById("startLocation").value.trim();
    const end = document.getElementById("endLocation").value.trim();
    const status = document.getElementById("routeStatus");
    const facilityStatus = document.getElementById("facilityStatus");

    if (!start || !end) {
        status.textContent =
            "Please enter both starting location and destination.";
        return;
    }

    status.textContent = "Searching locations and calculating route...";
    facilityStatus.textContent = "Waiting for route calculation...";
    document.getElementById("facilityList").innerHTML = "";

    try {
        const startPoint = await getCoordinates(start);
        const endPoint = await getCoordinates(end);

        const routeURL =
            `https://router.project-osrm.org/route/v1/driving/` +
            `${startPoint.lon},${startPoint.lat};` +
            `${endPoint.lon},${endPoint.lat}` +
            `?overview=full&geometries=geojson`;

        const response = await fetch(routeURL);

        if (!response.ok) {
            throw new Error("Route service is unavailable.");
        }

        const data = await response.json();

        if (!data.routes || !data.routes.length) {
            throw new Error("No driving route found.");
        }

        const route = data.routes[0];
        const coordinates = route.geometry.coordinates;

        routeLayer.clearLayers();
        facilityLayer.clearLayers();

        const routePoints = coordinates.map(point => [
            point[1], point[0]
        ]);

        const line = L.polyline(routePoints, {
            color: "#087f8c",
            weight: 6
        }).addTo(routeLayer);

        L.marker([startPoint.lat, startPoint.lon])
            .bindPopup("Starting Location")
            .addTo(routeLayer);

        L.marker([endPoint.lat, endPoint.lon])
            .bindPopup("Destination")
            .addTo(routeLayer);

        map.fitBounds(line.getBounds(), {padding: [30, 30]});

        const distance = (route.distance / 1000).toFixed(1);
        const duration = Math.round(route.duration / 60);

        status.textContent =
            `Route found! Distance: ${distance} km | Estimated driving time: ${duration} minutes.`;

        facilityStatus.textContent =
            "Searching for facilities along your route...";

        await searchFacilities(coordinates);

    } catch (error) {
        status.textContent = error.message;
        facilityStatus.textContent =
            "Facilities cannot be searched until a route is found.";
    }
}

// Calculate distance between two GPS points
function distanceBetween(a, b) {
    const rad = value => value * Math.PI / 180;
    const R = 6371000;

    const dLat = rad(b[0] - a[0]);
    const dLon = rad(b[1] - a[1]);

    const lat1 = rad(a[0]);
    const lat2 = rad(b[0]);

    const x =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1) * Math.cos(lat2) *
        Math.sin(dLon / 2) ** 2;

    return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// Find nearby facilities along the route
async function searchFacilities(coordinates) {
    const status = document.getElementById("facilityStatus");

    try {
        // Select route points approximately every 15 km
        const samples = [];
        let lastPoint = null;

        for (let i = 0; i < coordinates.length; i++) {
            const point = [coordinates[i][1], coordinates[i][0]];

            if (
                !lastPoint ||
                distanceBetween(lastPoint, point) >= 15000 ||
                i === coordinates.length - 1
            ) {
                samples.push(point);
                lastPoint = point;
            }
        }

        // Limit requests on very long journeys
        const limitedSamples = samples.filter((point, index) =>
            index % Math.max(1, Math.ceil(samples.length / 80)) === 0
        );

        const aroundQueries = limitedSamples.map(point => {
            const lat = point[0];
            const lon = point[1];

            return `
                nwr(around:2000,${lat},${lon})["amenity"~"restaurant|cafe|fast_food|hospital|clinic|police|toilets|fuel"];
                nwr(around:2000,${lat},${lon})["shop"~"car_repair|tyres|motorcycle|car"];
                nwr(around:2000,${lat},${lon})["craft"="mechanic"];
                nwr(around:2000,${lat},${lon})["tourism"~"hotel|motel|guest_house"];
            `;
        }).join("");

        const query = `
            [out:json][timeout:60];
            (
                ${aroundQueries}
            );
            out center tags;
        `;

        const response = await fetch(
            "https://overpass-api.de/api/interpreter",
            {
                method: "POST",
                body: query
            }
        );

        if (!response.ok) {
            throw new Error("Facility search service is busy. Try again later.");
        }

        const data = await response.json();

        const routePoints = coordinates
            .filter((point, index) => index % 5 === 0)
            .map(point => [point[1], point[0]]);

        const unique = new Map();

        data.elements.forEach(element => {
            const lat = element.lat ?? element.center?.lat;
            const lon = element.lon ?? element.center?.lon;

            if (lat == null || lon == null) return;

            const tags = element.tags || {};

            const nearRoute = routePoints.some(point =>
                distanceBetween(point, [lat, lon]) <= 2200
            );

            if (!nearRoute) return;

            const item = classifyFacility(tags);
            if (!item) return;

            const id = `${element.type}-${element.id}`;

            unique.set(id, {
                id,
                name: tags.name || item.name,
                category: item.category,
                type: item.type,
                lat,
                lon,
                address: [
                    tags["addr:street"],
                    tags["addr:city"]
                ].filter(Boolean).join(", "),
                opening: tags.opening_hours || "Hours not listed",
                phone: tags.phone || tags["contact:phone"] || "",
                tags
            });
        });

        routeFacilities = Array.from(unique.values());

        facilityLayer.clearLayers();

        routeFacilities.forEach(place => {
            L.circleMarker([place.lat, place.lon], {
                radius: 7,
                color: "#087f8c",
                fillColor: "#12a6a1",
                fillOpacity: 0.9
            })
            .bindPopup(
                `<b>${escapeHTML(place.name)}</b><br>` +
                `${escapeHTML(place.category)}`
            )
            .addTo(facilityLayer);
        });

        filterFacilities(selectedFilter);

        status.textContent =
            `${routeFacilities.length} mapped facilities found near the route.`;

    } catch (error) {
        status.textContent =
            error.message + " You can still use the road map.";
    }
}

// Identify facility type from OpenStreetMap tags
function classifyFacility(tags) {
    const amenity = tags.amenity;
    const shop = tags.shop;
    const tourism = tags.tourism;
    const craft = tags.craft;

    if (amenity === "restaurant" || amenity === "cafe" ||
        amenity === "fast_food") {
        return {category: "Restaurant / Food", type: "restaurant"};
    }

    if (amenity === "hospital" || amenity === "clinic") {
        return {category: "Medical Facility", type: "hospital"};
    }

    if (amenity === "police") {
        return {category: "Police Station", type: "police"};
    }

    if (amenity === "toilets") {
        return {category: "Public Restroom", type: "toilets"};
    }

    if (shop === "car_repair" || shop === "tyres" ||
        shop === "motorcycle" || craft === "mechanic") {
        return {category: "Vehicle Service", type: "mechanic"};
    }

    if (amenity === "fuel") {
        return {category: "Fuel Station", type: "reststop"};
    }

    if (tourism === "hotel" || tourism === "motel" ||
        tourism === "guest_house") {
        return {category: "Accommodation", type: "reststop"};
    }

    return null;
}

// Filter the displayed facilities
function filterFacilities(type) {
    selectedFilter = type;

    const list = document.getElementById("facilityList");
    const filtered = type === "all"
        ? routeFacilities
        : routeFacilities.filter(place => place.type === type);

    list.innerHTML = "";

    if (!filtered.length) {
        list.innerHTML =
            "<p>No mapped facilities found in this category along the searched route.</p>";
        return;
    }

    filtered.forEach(place => {
        const card = document.createElement("div");
        card.className = "facility-card";

        const name = document.createElement("h3");
        name.textContent = place.name;

        const category = document.createElement("p");
        category.textContent = place.category;

        const hours = document.createElement("p");
        hours.textContent = "Opening hours: " + place.opening;

        const address = document.createElement("p");
        address.textContent = place.address || "Address not listed";

        const mapLink = document.createElement("a");
        mapLink.href =
            `https://www.google.com/maps/search/?api=1&query=${place.lat},${place.lon}`;
        mapLink.target = "_blank";
        mapLink.rel = "noopener";
        mapLink.textContent = "View on Google Maps";

        card.append(name, category, hours, address, mapLink);

        if (place.phone) {
            const phone = document.createElement("p");
            phone.textContent = "Phone: " + place.phone;
            card.appendChild(phone);
        }

        list.appendChild(card);
    });
}

// Get live location for emergency map
function getLiveLocation() {
    const status = document.getElementById("locationStatus");
    const mapLink = document.getElementById("mapLink");

    if (!navigator.geolocation) {
        status.textContent = "Location is not supported by this browser.";
        return;
    }

    status.textContent = "Getting your location...";

    navigator.geolocation.getCurrentPosition(
        function(position) {
            const lat = position.coords.latitude;
            const lon = position.coords.longitude;

            status.textContent = "Your location has been detected.";

            mapLink.href =
                `https://www.google.com/maps?q=${lat},${lon}`;

            mapLink.style.display = "inline-block";
        },
        function() {
            status.textContent =
                "Location unavailable. Please allow location permission.";
        }
    );
}

// Keep names safe when used in map popup HTML
function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#039;"
    })[character]);
}

