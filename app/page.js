"use client";
import "@/public/globals.css"
import Renderer from '@/public/render.wgsl';
import Simulation from '@/public/compute.wgsl';
import { useEffect } from 'react';

const WEBGPU_NOT_SUPPORTED = 404;
const RENDER_LOOP_INTERVAL = 0;

async function initializeWebGPU(canvas) {
    const GPU = navigator.gpu;

    if (!GPU) throw new Error('WebGPU is not supported on this browser.', { cause: WEBGPU_NOT_SUPPORTED });

    const adapter = await GPU.requestAdapter({ powerPreference: 'high-performance', forceFallbackAdapter: false });

    if (!adapter) throw new Error('No appropriate GPUAdapter found.');

    const context = canvas.getContext('webgpu');

    if (!context) throw new Error('Failed to initialize WebGPU context.');

    const device = await adapter.requestDevice();

    const format = GPU.getPreferredCanvasFormat();

    context.configure({ device, format });

    return { context, device, format };
}

function createComputePipeline(layout, device) {
    const simulationShaderModule = device.createShaderModule({ label: 'Simulation Shader', code: Simulation });

    return device.createComputePipeline({
        label: 'Simulation Pipeline',
        layout,
        compute: {
            module: simulationShaderModule,
            entryPoint: 'mainCompute'
        }
    });
}

function createGridBindGroups(device, size) {
    const uniformArray = new Float32Array([size, size]);
    const uniformBuffer = device.createBuffer({
        label: 'Grid Uniforms',
        size: uniformArray.byteLength,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    device.queue.writeBuffer(uniformBuffer, 0, uniformArray);

    const storageArray = new Uint32Array(size * size);
    const storageBuffers = [
        device.createBuffer({
            label: 'Cell State A',
            size: storageArray.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        }),
        device.createBuffer({
            label: 'Cell State B',
            size: storageArray.byteLength,
            usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST
        })
    ];

    for (let i = 0; i < storageArray.length; i++) {
        storageArray[i] = +(Math.random() > 0.6);
    }

    device.queue.writeBuffer(storageBuffers[0], 0, storageArray);

    const bindGroupLayout = device.createBindGroupLayout({
        label: 'Cell Bind Group Layout',
        entries: [
            {
                binding: 0,
                buffer: { type: 'uniform' },
                visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT
            },
            {
                binding: 1,
                buffer: { type: 'read-only-storage' },
                visibility: GPUShaderStage.COMPUTE | GPUShaderStage.VERTEX
            },
            {
                binding: 2,
                buffer: { type: 'storage' },
                visibility: GPUShaderStage.COMPUTE
            }
        ]
    });

    const bindGroups = [
        device.createBindGroup({
            label: 'Cell Bind Group A',
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: { buffer: storageBuffers[0] } },
                { binding: 2, resource: { buffer: storageBuffers[1] } }
            ]
        }),
        device.createBindGroup({
            label: 'Cell Bind Group B',
            layout: bindGroupLayout,
            entries: [
                { binding: 0, resource: { buffer: uniformBuffer } },
                { binding: 1, resource: { buffer: storageBuffers[1] } },
                { binding: 2, resource: { buffer: storageBuffers[0] } }
            ]
        })
    ];

    return {
        layout: bindGroupLayout,
        groups: bindGroups
    };
}

function createRenderPipeline(device, format, layout) {
    const vertices = new Float32Array([
        -0.8, 0.8,
        0.8, 0.8,
        -0.8, -0.8,
        -0.8, -0.8,
        0.8, -0.8,
        0.8, 0.8
    ]);

    const vertexBuffer = device.createBuffer({
        label: 'Cell Vertices',
        size: vertices.byteLength,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST
    });

    device.queue.writeBuffer(vertexBuffer, 0, vertices);

    const pipelineLayout = device.createPipelineLayout({
        label: 'Cell Pipeline Layout',
        bindGroupLayouts: [layout],
    });

    const vertexBufferLayout = {
        arrayStride: 8,
        attributes: [{
            format: 'float32x2',
            shaderLocation: 0,
            offset: 0
        }]
    };

    const cellShaderModule = device.createShaderModule({ label: 'Cell Shader', code: Renderer });

    const cellPipeline = device.createRenderPipeline({
        label: 'Cell Pipeline',
        layout: pipelineLayout,
        vertex: {
            buffers: [vertexBufferLayout],
            module: cellShaderModule,
            entryPoint: 'mainVert'
        },
        fragment: {
            module: cellShaderModule,
            entryPoint: 'mainFrag',
            targets: [{ format }]
        }
    });

    return {
        vertices: vertices.length / 2,
        pipeline: cellPipeline,
        layout: pipelineLayout,
        buffer: vertexBuffer
    };
}

function createRenderPass(pipelines, context, groups, workgroupSize, device, buffer, instances, vertices, gridSize, step) {
    const commandEncoder = device.createCommandEncoder();

    const computePass = commandEncoder.beginComputePass();

    computePass.setPipeline(pipelines[0]);
    computePass.setBindGroup(0, groups[step % 2]);

    const workgroupCount = Math.ceil(gridSize / workgroupSize);

    computePass.dispatchWorkgroups(workgroupCount, workgroupCount);
    computePass.end();

    const renderPass = commandEncoder.beginRenderPass({
        colorAttachments: [{
            view: context.getCurrentTexture().createView(),
            clearValue: [0, 0, 0.4, 1],
            storeOp: 'store',
            loadOp: 'clear'
        }]
    });

    renderPass.setPipeline(pipelines[1]);
    renderPass.setVertexBuffer(0, buffer);
    renderPass.setBindGroup(0, groups[++step % 2]);
    renderPass.draw(vertices, instances);
    renderPass.end();

    device.queue.submit([commandEncoder.finish()]);

    return step;
}

export default function Home() {
    useEffect(() => {
        initializeWebGPU(document.getElementsByTagName('canvas')[0])
            .then(({ context, device, format }) => {
                let step = 0,
                    size = 2 ** 12,
                    instances = size * size,
                    lastRender = performance.now();

                const { layout: bindGroupLayout, groups } = createGridBindGroups(device, size);
                const { pipeline: renderPipeline, layout: pipelineLayout, buffer, vertices } = createRenderPipeline(device, format, bindGroupLayout);
                const computePipeline = createComputePipeline(pipelineLayout, device);

                const runSimulation = (time) => {
                    requestAnimationFrame(runSimulation);
                    if (time - lastRender < RENDER_LOOP_INTERVAL) return;

                    step = createRenderPass(
                        [computePipeline, renderPipeline],
                        context,
                        groups,
                        8,
                        device,
                        buffer,
                        instances,
                        vertices,
                        size,
                        step
                    );

                    lastRender = time;
                };

                requestAnimationFrame(runSimulation);
            })
            .catch(error =>
                error.cause === WEBGPU_NOT_SUPPORTED
                    ? alert(error.message)
                    : console.error(error)
            );
    }, []);

    return (
        <div className="text-center" id="container">
            <canvas id="canvas" width="1920" height="1080"/>
        </div>
    );
}