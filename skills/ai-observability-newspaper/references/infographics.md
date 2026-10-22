# An infographic for every story

Use the runtime's built-in image-generation tool only. The user explicitly selected **stop if unavailable**, with no OpenAI image API fallback. Do not ask for API keys, invoke an image SDK, use a placeholder, or silently publish fewer graphics.

1. Read the primary source and finish the story text first. Identify one useful mechanism, sequence, or relationship that the source supports. Explain one problem and how the verified change helps, using a single idea per graphic. Keep the story understandable without the image; do not move essential context, caveats, or definitions exclusively into visual labels.
2. Inspect a representative original Daily Diff infographic if one is available locally or from its CDN. Use it only as a visual style reference; never reuse its unrelated subject or facts.
3. Make one built-in generation call per distinct story. Produce a clean newspaper infographic with warm paper, dark ink, restrained accents, a clear plain-language title, readable labels, and a small number of connected elements. Reuse the story's terminology and explain necessary specialist terms; avoid acronym-heavy labels and architecture overviews that require another context switch. Do not make a collage to stand in for separate images.
4. For a brief, illustrate its narrow change directly. For example, a span-ingestion fix can show a conceptual delivery path and the need to verify arrival. Do not invent architecture details or before/after performance figures absent from the source. Label inferred guidance as conceptual/editorial.
5. Inspect the actual output with the runtime's image viewer. Check spelling, numerical claims, arrows, readability, factual scope, and source-versus-editorial distinction. Regenerate when needed. `reviewed: true` means this inspection happened; never set it merely because generation returned a file.
6. Keep the built-in generator's original PNG in the run evidence directory. Publish an optimized **static WebP**, never the multi-megabyte original. From the repository root run:
   ```sh
   node scripts/optimize-newspaper-image.js ORIGINAL.png IMAGE_DIRECTORY/story-slug.webp
   ```
   The converter uses the repository's `sharp` dependency (installed with `npm ci`), preserves proportions without cropping or enlargement, caps width at 1440 pixels, and tries quality 82 down to 70 to fit **300,000 bytes (300 KB)**. Its shortest edge must remain at least 512 pixels. It stops if that budget cannot be met; simplify/regenerate instead of sacrificing readable labels. Typical newspaper graphics should be around 80–150 KB. Existing output files are never overwritten.
7. Inspect the **final WebP**, including labels at article width and in zoom view. If compression makes text illegible, regenerate a simpler graphic and reconvert. Use the supplied `IMAGE_URL_PREFIX` with `story-slug.webp` in the draft. Record the converter's `image_width`, `image_height`, and `optimization` metadata. Hash and review refer to the published WebP, not the original PNG.
8. Store `image_provenance`: `kind: "generated-editorial"`, `generator: "built-in-imagegen"`, complete final `prompt`, `based_on` containing the primary evidence URL, `reviewed: true`, and final WebP `sha256`; put the returned `optimization` object in this provenance too. The reader discloses generated graphics once per edition in a visually hidden note linked from each image (`aria-describedby`), not as a caption under each image. Never put an "AI-generated" label, footer, or watermark in the image itself; `validateDailyDraft` rejects such prompts. A generated graphic must never be presented as the publisher's own screenshot.

Example prompt structure (replace all bracketed inputs):

```text
Use case: infographic-diagram
Asset type: newspaper story infographic, a standalone PNG
Primary request: explain [one mechanism supported by the linked story]
Source-supported facts: [short factual list, no copied article passages]
Editorial guidance, explicitly conceptual: [optional operator check]
Style: warm newsprint, dark ink, restrained accent, generous spacing
Composition: a clear title and 3–5 labelled elements; readable at article width
Text (verbatim): [exact short title and labels]
Constraints: no invented metrics, no unsupported product architecture,
no fake screenshots, no unrelated logos, no "AI-generated" label or watermark text;
preserve source/editorial distinction
```

The runner validates file existence, WebP format and full decoding, the 300 KB size budget, dimensions, final hashes, and distinct assets. It cannot replace an agent's visual or factual review. An image-generation failure fails the edition; logs and the draft remain for diagnosis. Story length, signal score, and HN/News/GitHub category are never reasons to skip generation.
