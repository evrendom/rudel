declare const self: {
	addEventListener(type: "message", listener: () => void): void;
};

self.addEventListener("message", () => {
	// Deliberately never respond: the scanner deadline must terminate this worker.
});
