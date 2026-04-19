# Archetype Taxonomy

This is the active Wrapped archetype taxonomy.

The product-facing label set is:

- Roadrunner
- Window Shopper
- NPC
- Papa's Credit Card
- Hit and Runner
- ADHD Brain
- Needs to Touch Grass
- Tourist
- Maniac

Older theoretical labels are retired and should not be used in product copy, analytics outputs, or implementation docs.

## Feature Space

Each archetype is assigned from the normalized user feature vector defined in the pipeline:

- consistency
- intensity
- session shape
- cost intensity
- output
- breadth
- range

These definitions describe the intended reading of each cluster, not a separate rule engine.

## Active Archetypes

### Roadrunner

Low consistency, high burst intensity, broad exploration, and wide model range.

Reads like:
- comes in waves
- tries a lot
- covers ground quickly

### Window Shopper

Low-to-medium consistency and intensity, moderate output, lighter cost, and relatively high range.

Reads like:
- drops in occasionally
- experiments more than they commit
- keeps the relationship light

### NPC

High consistency, high intensity, strong session shape, low cost intensity, and balanced breadth.

Reads like:
- shows up often
- gets real work done
- converts time into output without waste

### Papa's Credit Card

Low consistency and low output, but a surprisingly high cost footprint relative to the amount of work completed.

Reads like:
- spends more effort than they convert
- pokes around without turning it into sustained progress

### Hit and Runner

Short, narrow, low-cost sessions that still produce output.

Reads like:
- gets in
- makes the change
- gets out

### ADHD Brain

Moderate-to-high consistency with wide breadth and high range, but less concentrated output than the top operator groups.

Reads like:
- works across many surfaces
- samples many tools and models
- values coverage over specialization

### Needs to Touch Grass

High consistency, high intensity, strong session shape, high cost intensity, and broad working range.

Reads like:
- deeply engaged
- frequently active
- operating at sustained, heavyweight usage

### Tourist

Light, low-commitment usage with low output and low range, even if breadth is not zero.

Reads like:
- visits the tool
- does not really live there

### Maniac

Medium-to-high consistency and intensity with high cost and high output, but narrow breadth and tighter range.

Reads like:
- goes deep, not wide
- leans hard into a focused mode of work
- extracts a lot from a narrower lane

## Canonical Artifacts

The active taxonomy should be read from:

- [archetype-clickhouse-pipeline.md](/Users/evrendombak/conductor/workspaces/rudel/geneva/docs/archetype-clickhouse-pipeline.md)
- `.context/archetype-clickhouse-reference.sql`
- `.context/all-user-archetypes-v2.json`
- `.context/numia-org-user-archetypes.json`

If these ever disagree, fix the source data and pipeline notes rather than reintroducing legacy labels.
