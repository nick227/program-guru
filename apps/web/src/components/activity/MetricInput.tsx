import type { components } from '@project/sdk'
import { Button } from '@/components/ui/Button'
import { Input } from '@/components/ui/Input'
import { Row, Stack } from '@/components/ui/Layout'
type Metric = components['schemas']['MetricInput']
export function MetricInput({
  metric,
  value,
  onChange,
  disabled,
}: {
  metric: Metric
  value: string | number | boolean | null
  onChange: (value: string | number | boolean) => void
  disabled: boolean
}) {
  const id = `${metric.instructionId ?? 'activity'}-${metric.metricDefinitionId}`
  return (
    <Stack className="gap-2">
      <label htmlFor={id} className="text-base font-semibold">
        {metric.label}
        {metric.unit ? ` (${metric.unit})` : ''}
      </label>
      <Row>
        {metric.valueType === 'BOOLEAN' ? (
          <Button
            id={id}
            variant="outline"
            disabled={disabled}
            aria-pressed={value === true}
            onClick={() => onChange(value !== true)}
          >
            {value === null ? 'Not recorded' : value ? 'Yes' : 'No'}
          </Button>
        ) : metric.valueType === 'TEXT' ? (
          <Input
            id={id}
            value={value === null ? '' : String(value)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
          />
        ) : (
          <>
            <Button
              variant="outline"
              disabled={disabled}
              aria-label={`Decrease ${metric.label}`}
              onClick={() => onChange(Number(value ?? 0) - 1)}
            >
              −
            </Button>
            <Input
              id={id}
              className="w-24 text-center"
              type="number"
              step={metric.valueType === 'DECIMAL' ? 'any' : '1'}
              value={value === null ? '' : String(value)}
              disabled={disabled}
              onChange={(e) =>
                onChange(e.target.value === '' ? '' : Number(e.target.value))
              }
            />
            <Button
              variant="outline"
              disabled={disabled}
              aria-label={`Increase ${metric.label}`}
              onClick={() => onChange(Number(value ?? 0) + 1)}
            >
              +
            </Button>
          </>
        )}
      </Row>
      {(metric.target !== null || metric.previous !== null) && (
        <p className="text-xs text-muted">
          {[
            metric.target !== null ? `Suggested target ${show(metric.target, metric.unit)}` : null,
            metric.previous !== null ? `Last time ${show(metric.previous, metric.unit)}` : null,
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
    </Stack>
  )
}

/** A target or previous value for display; never written as a result. */
function show(value: string | number | boolean, unit?: string | null) {
  const text = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value)
  return unit ? `${text} ${unit}` : text
}
