struct VertexOutput {
  @location(0) cell: vec2f,
  @builtin(position) position: vec4f
};

// Uniform buffer for the grid size.
@group(0) @binding(0) var<uniform> grid: vec2f;

// Storage buffer for the state of each cell.
@group(0) @binding(1) var<storage> state: array<u32>;

@vertex
fn mainVert(
  // Grid vertex position.
  @location(0) position: vec2f,
  // Cell instance index from `0` to `grid * grid - 1`.
  @builtin(instance_index) instance: u32
) -> VertexOutput
{
  let fInstance = f32(instance);
  let state = f32(state[instance]);

  // Cell coordinates from its instance index.
  let cell = vec2f(fInstance % grid.x, floor(fInstance / grid.x));

  var output: VertexOutput;

  output.position = vec4f(
    // Normalized cell position and scale.
    (position * state + 1) / grid - 1 +
    // Cell position offset.
    cell / grid * 2,
    0, 1
  );

  output.cell = cell;
  return output;
}

@fragment
// `VertexOutput` can be "destructured"
// to use individual properties.
fn mainFrag(
  @location(0) cell: vec2f
) -> @location(0) vec4f
{
  let rg = cell / grid;
  // Tweak the blue channel.
  return vec4f(rg, 1 - rg.g, 1);
}