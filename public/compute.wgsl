// Uniform buffer for the grid size.
@group(0) @binding(0) var<uniform> grid: vec2f;

// Exposed cell input and output states as storage buffers.
@group(0) @binding(1) var<storage> cellStateIn: array<u32>; // read-only
@group(0) @binding(2) var<storage, read_write> cellStateOut: array<u32>;

// Mapped cell index into a linear storage array.
fn cellIndex(cell: vec2u) -> u32 {
  // Cells on the edge of the grid will treat cells on the opposite edge as their neighbors,
  // creating a kind of wrap-around effect in order to prevent out-of-bounds accesses.
  return (cell.x % u32(grid.x)) + (cell.y % u32(grid.y)) * u32(grid.x);
}

// Cell state at the given grid coordinates.
fn cellActive(x: u32, y: u32) -> u32 {
  return cellStateIn[cellIndex(vec2(x, y))];
}

@compute
@workgroup_size(16, 16)
fn mainCompute(
  // Three-dimensional vector of unsigned integers holding the index
  // of the current call from the grid of shader invocations.
  @builtin(global_invocation_id) cell: vec3u
) {
  // Amount of active neighbors of the current cell.
  let activeNeighbors =
    cellActive(cell.x + 1, cell.y + 1) +
    cellActive(cell.x + 1, cell.y    ) +
    cellActive(cell.x + 1, cell.y - 1) +
    cellActive(cell.x    , cell.y - 1) +
    cellActive(cell.x - 1, cell.y - 1) +
    cellActive(cell.x - 1, cell.y    ) +
    cellActive(cell.x - 1, cell.y + 1) +
    cellActive(cell.x    , cell.y + 1);

  let i = cellIndex(cell.xy);

  switch activeNeighbors
  {
    // Cells with two neighbors stay active.
    case 2: { cellStateOut[i] = cellStateIn[i]; }
    // Cells with exactly three neighbors become active.
    case 3: { cellStateOut[i] = 1; }
    // Cells with fewer than two neighbors or with
    // more than three neighbors become inactive.
    default: { cellStateOut[i] = 0; }
  }
}