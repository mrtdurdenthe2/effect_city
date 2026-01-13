import { Application } from "./Application.js"

// Get canvas element
const canvas = document.getElementById("canvas") as HTMLCanvasElement

if (!canvas) {
  throw new Error("Canvas element not found")
}

// Initialize application
const app = Application.getInstance(canvas)

// Start application
app.start()

// Log startup
console.log("Effect City visualization started")
console.log("Connecting to server...")

// Handle page unload
window.addEventListener("beforeunload", () => {
  app.dispose()
})
