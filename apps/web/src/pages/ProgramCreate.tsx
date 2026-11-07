import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateProgram, useFocuses, useProgramTypes } from '@project/sdk'
import { Page, Stage, Grid } from '@/components/ui/Layout'
import { Button } from '@/components/ui/Button'
import { ErrorMessage, Loading } from '@/components/ui/Feedback'
import { Back } from '@/components/Navigation'
import { useOnline } from '@/lib/useOnline'
export function ProgramCreatePage() {
  const [typeId, setTypeId] = useState('')
  const types = useProgramTypes()
  const focuses = useFocuses(typeId)
  const create = useCreateProgram()
  const navigate = useNavigate()
  const online = useOnline()
  async function start(focusId: string | null) {
    try {
      const workspace = await create.mutateAsync({
        programTypeId: typeId,
        focusId,
      })
      navigate(`/programs/${workspace.id}/workspace?panel=activities`, {
        replace: true,
      })
    } catch {
      /* keep selection */
    }
  }
  return (
    <Page>
      <Stage>
        <Back to="/discover">Browse Programs</Back>
        <h1>{typeId ? 'What is your focus?' : 'What are you creating?'}</h1>
        <ErrorMessage error={types.error || focuses.error || create.error} />
        {!typeId ? (
          types.isPending ? (
            <Loading />
          ) : (
            <Grid className="grid-cols-2">
              {types.data?.map((type) => (
                <Button
                  key={type.id}
                  variant="outline"
                  className="min-h-24 bg-surface"
                  onClick={() => setTypeId(type.id)}
                >
                  {type.label}
                </Button>
              ))}
            </Grid>
          )
        ) : (
          <>
            {focuses.isPending ? (
              <Loading />
            ) : (
              <Grid className="grid-cols-2">
                {focuses.data?.map((focus) => (
                  <Button
                    key={focus.id}
                    variant="outline"
                    className="min-h-24 bg-surface"
                    disabled={!online || create.isPending}
                    onClick={() => void start(focus.id)}
                  >
                    {focus.label}
                  </Button>
                ))}
                <Button
                  variant="outline"
                  disabled={!online || create.isPending}
                  onClick={() => void start(null)}
                >
                  General
                </Button>
              </Grid>
            )}
            <Button
              variant="ghost"
              disabled={create.isPending}
              onClick={() => setTypeId('')}
            >
              Change type
            </Button>
          </>
        )}
      </Stage>
    </Page>
  )
}
