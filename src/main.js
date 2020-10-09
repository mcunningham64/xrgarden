import { renderer, scene, camera, rafCallbacks, water } from "./lib/scene.js";
import { controller1 } from "./lib/controllers/controllers.js";
import { gamepad } from "./lib/controllers/gamepad.js";
import { Flow } from "./lib/flow.js";

import {
	Mesh,
	PlaneGeometry,
	AdditiveBlending,
	CanvasTexture,
	DoubleSide,
	MeshBasicMaterial,
	Vector3,
	CatmullRomCurve3,
	BufferGeometry,
	LineBasicMaterial,
	LineLoop,
	CircleGeometry,
	InstancedMesh,
	DynamicDrawUsage
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { Matrix4 } from "three";
import Stats from 'three/examples/jsm/libs/stats.module.js';
const stats = new Stats();
document.body.appendChild( stats.dom );

const loader = new GLTFLoader();

const canvas = document.createElement("canvas");
const canvasTexture = new CanvasTexture(canvas);
canvas.width = 1024;
canvas.height = 256;
const ctx = canvas.getContext("2d");
function writeText(text) {
	if (typeof text !== "string") text = JSON.stringify(text, null, 2);
	ctx.font = "120px fantasy";
	ctx.fillStyle = "black";
	ctx.fillRect(0, 0, canvas.width, canvas.height);
	ctx.fillStyle = "white";
	text.split("\n").forEach((str, i) => ctx.fillText(str, 0, (i + 1) * 120));
	canvasTexture.needsUpdate = true;
}

const geometry = new PlaneGeometry(
	(0.3 * canvas.width) / 1024,
	(0.3 * canvas.height) / 1024
);
const material = new MeshBasicMaterial({
	map: canvasTexture,
	blending: AdditiveBlending,
	transparent: true,
});
const consolePlane = new Mesh(geometry, material);
consolePlane.renderOrder = 1;
consolePlane.position.set(0, (0.5 * 0.3 * canvas.height) / 1024, -0.1);
consolePlane.rotation.set(-Math.PI / 4, 0, 0);
controller1.add(consolePlane);
writeText("hi");

gamepad.addEventListener("gamepadInteraction", function (event) {
	writeText(`${event.detail.type} ${event.detail.value}`);
});

const modelsPromise = (async function () {
	// Forest from Google Poly, https://poly.google.com/view/2_fv3tn3NG_
	const { scene: treesScene } = await new Promise((resolve) =>
		loader.load("./assets/forest.glb", resolve)
	);
	const trees = treesScene.children[0];
	trees.position.z = 0;
	trees.position.y = 2.5;
	trees.scale.multiplyScalar(10);
	trees.traverse((o) => {
		if (o.material) {
			o.material.side = DoubleSide;
			o.material.depthWrite = true;
		}
	});
	scene.add(trees);

	// Fish by RunemarkStudio, https://sketchfab.com/3d-models/koi-fish-8ffded4f28514e439ea0a26d28c1852a
	const { scene: fishScene } = await new Promise((resolve) =>
		loader.load("./assets/fish.glb", resolve)
	);

	const matrix = new Matrix4();
	class Fishes extends Flow {
		constructor(count) {
			const fish = new InstancedMesh(
				fishScene.children[0].geometry,
				fishScene.children[0].material,
				count
			);
			fish.geometry.scale(0.6, 0.6, 0.6);
			fish.geometry.rotateZ(Math.PI);
			fish.geometry.rotateY(-Math.PI / 2);
			fish.instanceMatrix.setUsage(DynamicDrawUsage);
			super(fish);

			this.offsets = new Array(count).fill(0);
			this.count = count;
		}
		moveIndividualAlongCurve(index, offset) {
			this.offsets[index] += offset;
			matrix.makeTranslation(0, 0, this.offsets[index]);
			this.object3D.setMatrixAt(index, matrix);
			this.object3D.instanceMatrix.needsUpdate = true;
		}
	}
	return { trees, Fishes };
})();

(async function generatePath() {
	const curve = new CatmullRomCurve3([
		new Vector3(-1, 0.15, 1),
		new Vector3(-1, 0.15, -1),
		new Vector3(0, 0.15, 0),
		new Vector3(1, 0.15, -1),
		new Vector3(2, 0.15, 2),
	]);
	curve.curveType = "centripetal";
	curve.closed = true;
	const points = curve.getPoints(50);
	const line = new LineLoop(
		new BufferGeometry().setFromPoints(points),
		new LineBasicMaterial({ color: 0x00ff00 })
	);
	scene.add(line);

	const { Fishes } = await modelsPromise;
	const fishes = new Fishes(150);
	fishes.addToCurve(curve);
	scene.add(fishes.object3D);

	for (let i = 0; i < fishes.count; i++) {
		fishes.moveIndividualAlongCurve(i, i * 1 / fishes.count);
	}

	const speedPerTick = 0.006 / curve.getLength();
	rafCallbacks.add(function () {
		// fishes.moveAlongCurve(speedPerTick);
		for (let i = 0; i < fishes.count; i++) {
			fishes.moveIndividualAlongCurve(i, Math.random() * speedPerTick);
		}
	});

	rafCallbacks.add(() => stats.update());
})();

(function rain() {
	const rainRipples = [];
	const unsedRainRipples = [];
	const geometry = new CircleGeometry(1, 32);
	geometry.rotateX(-Math.PI / 2);
	geometry.vertices.splice(0, 1);

	for (let i = 0; i < 5*3; i++) {
		const material = new LineBasicMaterial({
			color: 0x999999,
			blending: AdditiveBlending,
		});
		const mesh = new LineLoop(geometry, material);
		rainRipples.push(mesh);
		unsedRainRipples.push(mesh);
	}

	(function drip() {
		if (unsedRainRipples.length > 3) {
			const ripplesToUse = unsedRainRipples.splice(0, 3);
			const x = 20 * (Math.random() - 0.5);
			const z = 20 * (Math.random() - 0.5);
			for (let ri = 1; ri <= 3; ri++) {
				const ripple = ripplesToUse[ri - 1];
				ripple.position.set(x, -0.1, z);
				setTimeout(() => {
					ripple.scale.multiplyScalar(0);
					ripple.material.color.setHex(0xffffff);
					water.add(ripple);
					setTimeout(() => {
						water.remove(ripple);
						unsedRainRipples.push(ripple)
					}, 2000);
				}, ri * 600);
			}
		}

		setTimeout(drip, Math.random() * 1000);
	}());

	const rippleSpeed = new Vector3(1, 1, 1).multiplyScalar(0.03);
	rafCallbacks.add(function () {
		for (const r of rainRipples) {
			r.scale.add(rippleSpeed);
			const col = (r.material.color.getHex() >> 16)*0.95;
			const newCol = (col << 16) + (col << 8) + col;
			r.material.color.setHex(newCol);
		}
	});
})();

window.renderer = renderer;
window.camera = camera;
window.scene = scene;
