import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { ZodSchema } from 'zod'
import { Input } from './Input'
import { Textarea } from './Textarea'
import { Button } from './Button'
import { cn } from '@/lib/utils'

export type FieldConfig = {
  name: string
  label: string
  type: 'text' | 'email' | 'password' | 'textarea' | 'url' | 'tel'
  placeholder?: string
  voice?: boolean
  required?: boolean
  rows?: number
}

interface FormProps<T extends Record<string, unknown>> {
  serverErrors?: Record<string, string>
  fields: FieldConfig[]
  schema: ZodSchema<T>
  onSubmit: (data: T) => Promise<void> | void
  submitLabel?: string
  defaultValues?: Partial<T>
  isLoading?: boolean
  className?: string
}

export function Form<T extends Record<string, unknown>>({
  fields,
  serverErrors,
  schema,
  onSubmit,
  submitLabel = 'Submit',
  defaultValues,
  isLoading = false,
  className,
}: FormProps<T>) {
  function normalizeSubmitData(data: T) {
    const optionalFields = new Set(
      fields.filter((field) => !field.required).map((field) => field.name),
    )
    return Object.fromEntries(
      Object.entries(data).filter(
        ([key, value]) => !(optionalFields.has(key) && value === ''),
      ),
    ) as T
  }

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<T>({
    resolver: zodResolver(schema),
    defaultValues: defaultValues as never,
  })

  return (
    <form
      onSubmit={handleSubmit((data) => onSubmit(normalizeSubmitData(data)))}
      className={cn('form', className)}
    >
      {fields.map((field) => {
        const id = `field-${field.name}`
        return (
          <div key={field.name} className="field">
            <label htmlFor={id} className="label">
              {field.label}
            </label>

            {field.type === 'textarea' ? (
              <Textarea
                {...register(field.name as never)}
                id={id}
                aria-invalid={
                  !!errors[field.name] || !!serverErrors?.[field.name]
                }
                aria-describedby={
                  errors[field.name] || serverErrors?.[field.name]
                    ? `${id}-error`
                    : undefined
                }
                placeholder={field.placeholder}
                rows={field.rows ?? 4}
                voice={field.voice}
                onVoiceResult={(t) =>
                  setValue(field.name as never, t as never)
                }
              />
            ) : (
              <Input
                {...register(field.name as never)}
                id={id}
                aria-invalid={
                  !!errors[field.name] || !!serverErrors?.[field.name]
                }
                aria-describedby={
                  errors[field.name] || serverErrors?.[field.name]
                    ? `${id}-error`
                    : undefined
                }
                type={field.type}
                placeholder={field.placeholder}
                voice={field.voice}
                onVoiceResult={(t) =>
                  setValue(field.name as never, t as never)
                }
              />
            )}

            {(errors[field.name] || serverErrors?.[field.name]) && (
              <p id={`${id}-error`} className="field-error">
                {(errors[field.name]?.message as string) ||
                  serverErrors?.[field.name]}
              </p>
            )}
          </div>
        )
      })}

      <Button
        type="submit"
        loading={isSubmitting || isLoading}
        className="w-full"
      >
        {submitLabel}
      </Button>
    </form>
  )
}
