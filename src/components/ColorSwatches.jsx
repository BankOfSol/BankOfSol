// Controlled row of color swatches for a product's available colors
// ([{ name, hex }]). `value` is the selected color name (or null = "as
// designed"). The swatch background is the one place a raw hex is rendered —
// it IS the data being previewed, not theming.
export default function ColorSwatches({ colors = [], value, onChange, showReset = true }) {
  if (!colors.length) return null;
  const selected = colors.find((c) => c.name === value);

  return (
    <div className="swatch-row" role="radiogroup" aria-label="Color">
      {colors.map((c) => (
        <button
          key={c.name}
          type="button"
          role="radio"
          aria-checked={value === c.name}
          className={`swatch${value === c.name ? " active" : ""}`}
          style={{ background: c.hex }}
          title={c.name}
          onClick={() => onChange?.(c.name)}
        />
      ))}
      {showReset && value && (
        <button type="button" className="swatch-reset" onClick={() => onChange?.(null)}>
          reset
        </button>
      )}
      <span className="swatch-name">{selected ? selected.name : ""}</span>
    </div>
  );
}
