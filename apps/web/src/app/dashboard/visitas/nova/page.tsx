'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { format } from 'date-fns'
import { propertiesApi, visitsApi, type Property } from '@/lib/api'
import { PageHeader } from '@/components/ui/PageHeader'
import { Card } from '@/components/ui/Card'
import { Badge } from '@/components/ui/Badge'
import { ArrowLeft, Plus, Trash2, Loader2, CheckCircle } from 'lucide-react'

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '9px 12px', borderRadius: 6,
  border: '1px solid var(--color-border)', background: '#fff',
  fontSize: '0.875rem', fontFamily: 'inherit', outline: 'none',
}

const labelStyle: React.CSSProperties = {
  display: 'block', fontSize: '0.78rem', fontWeight: 600,
  color: 'var(--color-text-muted)', marginBottom: 6,
  textTransform: 'uppercase', letterSpacing: '0.03em',
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <label style={labelStyle}>{label}</label>
      {children}
    </div>
  )
}

function SectionTitle({ title }: { title: string }) {
  return (
    <div style={{
      fontWeight: 700, fontSize: '0.8rem', textTransform: 'uppercase',
      letterSpacing: '0.05em', color: 'var(--color-text-muted)',
      paddingBottom: 12, borderBottom: '1px solid var(--color-border)',
      marginBottom: 16,
    }}>
      {title}
    </div>
  )
}

export default function NovaVisitaPage() {
  const router = useRouter()
  const queryClient = useQueryClient()

  // Campos base
  const [propertyId, setPropertyId] = useState('')
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'))
  const [kmStart, setKmStart] = useState('')
  const [kmEnd, setKmEnd] = useState('')
  const [observations, setObservations] = useState('')

  // Fazendas próprias
  const [workHours, setWorkHours] = useState('')
  const [inputs, setInputs] = useState<{ product_id: string; quantity: string; unit: string }[]>([])

  // Clientes
  const [services, setServices] = useState<{ service_type_id: string; quantity: string; unit_price: string; observations: string }[]>([])
  const [sales, setSales] = useState<{ product_id: string; quantity: string; unit_price: string }[]>([])

  const { data: properties } = useQuery({
    queryKey: ['properties'],
    queryFn: () => propertiesApi.list().then((r) => r.data),
  })

  const selectedProperty = properties?.find((p) => p.id === propertyId)
  const isPropria = selectedProperty?.tipo === 'propria'

  const { mutate, isPending, isSuccess } = useMutation({
    mutationFn: () => {
      const payload: any = {
        property_id: propertyId,
        collaborator_id: 'CURRENT_USER_ID', // TODO: pegar do JWT
        date,
        km_start: kmStart ? Number(kmStart) : undefined,
        km_end: kmEnd ? Number(kmEnd) : undefined,
        observations: observations || undefined,
      }

      if (isPropria) {
        payload.work_hours = workHours ? Number(workHours) : undefined
        payload.inputs_used = inputs
          .filter((i) => i.product_id && i.quantity)
          .map((i) => ({ ...i, quantity: Number(i.quantity) }))
      } else {
        payload.services = services
          .filter((s) => s.service_type_id)
          .map((s) => ({
            service_type_id: s.service_type_id,
            quantity: s.quantity ? Number(s.quantity) : undefined,
            unit_price: s.unit_price ? Number(s.unit_price) : undefined,
            observations: s.observations || undefined,
          }))
        payload.sales = sales
          .filter((s) => s.product_id && s.quantity && s.unit_price)
          .map((s) => ({ ...s, quantity: Number(s.quantity), unit_price: Number(s.unit_price) }))
      }

      return visitsApi.create(payload)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['visits'] })
      setTimeout(() => router.push('/dashboard/visitas'), 1500)
    },
  })

  const canSubmit = propertyId && date && !isPending && !isSuccess

  return (
    <div>
      <PageHeader
        title="Nova visita"
        subtitle={selectedProperty ? selectedProperty.name : 'Selecione a propriedade'}
        action={
          <button
            onClick={() => router.back()}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '7px 14px', borderRadius: 6,
              border: '1px solid var(--color-border)',
              background: '#fff', cursor: 'pointer',
              fontFamily: 'inherit', fontSize: '0.875rem',
              color: 'var(--color-text-muted)',
            }}
          >
            <ArrowLeft size={15} /> Voltar
          </button>
        }
      />

      <div style={{ padding: '24px 32px', maxWidth: 720, display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Dados base */}
        <Card style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SectionTitle title="Informações gerais" />

          <Field label="Propriedade *">
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              style={{ ...inputStyle, cursor: 'pointer' }}
            >
              <option value="">Selecione…</option>
              {properties?.filter((p) => p.tipo === 'propria').length ? (
                <optgroup label="Fazendas próprias">
                  {properties.filter((p) => p.tipo === 'propria').map((p) => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </optgroup>
              ) : null}
              {properties?.filter((p) => p.tipo === 'cliente').length ? (
                <optgroup label="Clientes">
                  {properties.filter((p) => p.tipo === 'cliente').map((p) => (
                    <option key={p.id} value={p.id}>{p.name} {p.city ? `— ${p.city}` : ''}</option>
                  ))}
                </optgroup>
              ) : null}
            </select>
          </Field>

          {selectedProperty && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 6, background: 'var(--color-bg)', fontSize: '0.85rem' }}>
              <Badge variant={selectedProperty.tipo}>
                {selectedProperty.tipo === 'propria' ? 'Fazenda própria' : 'Cliente'}
              </Badge>
              <span style={{ color: 'var(--color-text-muted)' }}>
                {selectedProperty.tipo === 'propria'
                  ? 'Fluxo completo: checkpoints, insumos e horas'
                  : 'Fluxo de visita: serviços e vendas'}
              </span>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
            <Field label="Data *">
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                style={inputStyle}
              />
            </Field>
            <Field label="KM inicial">
              <input
                type="number"
                value={kmStart}
                onChange={(e) => setKmStart(e.target.value)}
                placeholder="ex: 45200"
                style={inputStyle}
              />
            </Field>
            <Field label="KM final">
              <input
                type="number"
                value={kmEnd}
                onChange={(e) => setKmEnd(e.target.value)}
                placeholder="ex: 45380"
                style={inputStyle}
              />
            </Field>
          </div>

          {kmStart && kmEnd && Number(kmEnd) > Number(kmStart) && (
            <div style={{ fontSize: '0.8rem', color: 'var(--color-primary)', fontWeight: 600 }}>
              ✓ {(Number(kmEnd) - Number(kmStart)).toLocaleString('pt-BR')} km nesta visita
            </div>
          )}

          <Field label="Observações">
            <textarea
              value={observations}
              onChange={(e) => setObservations(e.target.value)}
              rows={3}
              placeholder="Anotações gerais sobre a visita…"
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </Field>
        </Card>

        {/* Fazenda própria */}
        {isPropria && (
          <>
            <Card style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <SectionTitle title="Horas trabalhadas" />
              <Field label="Total de horas">
                <input
                  type="number"
                  value={workHours}
                  onChange={(e) => setWorkHours(e.target.value)}
                  placeholder="ex: 8"
                  style={{ ...inputStyle, maxWidth: 180 }}
                />
              </Field>
            </Card>

            <Card style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <SectionTitle title="Insumos utilizados" />
              {inputs.map((inp, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 100px 80px 36px', gap: 8, alignItems: 'end' }}>
                  <Field label={i === 0 ? 'Produto' : ''}>
                    <input
                      value={inp.product_id}
                      onChange={(e) => setInputs(inputs.map((x, j) => j === i ? { ...x, product_id: e.target.value } : x))}
                      placeholder="ID ou nome do produto"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label={i === 0 ? 'Qtd' : ''}>
                    <input
                      type="number"
                      value={inp.quantity}
                      onChange={(e) => setInputs(inputs.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))}
                      placeholder="0"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label={i === 0 ? 'Unidade' : ''}>
                    <input
                      value={inp.unit}
                      onChange={(e) => setInputs(inputs.map((x, j) => j === i ? { ...x, unit: e.target.value } : x))}
                      placeholder="kg, L…"
                      style={inputStyle}
                    />
                  </Field>
                  <button
                    onClick={() => setInputs(inputs.filter((_, j) => j !== i))}
                    style={{ padding: 8, borderRadius: 6, border: '1px solid #fecaca', background: '#fff5f5', cursor: 'pointer', color: '#dc2626', marginTop: i === 0 ? 22 : 0 }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setInputs([...inputs, { product_id: '', quantity: '', unit: '' }])}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 6,
                  border: '1px dashed var(--color-border)',
                  background: 'transparent', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: '0.85rem',
                  color: 'var(--color-text-muted)', alignSelf: 'flex-start',
                }}
              >
                <Plus size={14} /> Adicionar insumo
              </button>
            </Card>
          </>
        )}

        {/* Cliente: serviços */}
        {selectedProperty && !isPropria && (
          <>
            <Card style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <SectionTitle title="Serviços prestados" />
              {services.map((s, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 36px', gap: 8, alignItems: 'end' }}>
                  <Field label={i === 0 ? 'Tipo de serviço' : ''}>
                    <input
                      value={s.service_type_id}
                      onChange={(e) => setServices(services.map((x, j) => j === i ? { ...x, service_type_id: e.target.value } : x))}
                      placeholder="ID do serviço"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label={i === 0 ? 'Qtd' : ''}>
                    <input
                      type="number"
                      value={s.quantity}
                      onChange={(e) => setServices(services.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))}
                      placeholder="0"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label={i === 0 ? 'Valor unit.' : ''}>
                    <input
                      type="number"
                      value={s.unit_price}
                      onChange={(e) => setServices(services.map((x, j) => j === i ? { ...x, unit_price: e.target.value } : x))}
                      placeholder="R$ 0,00"
                      style={inputStyle}
                    />
                  </Field>
                  <button
                    onClick={() => setServices(services.filter((_, j) => j !== i))}
                    style={{ padding: 8, borderRadius: 6, border: '1px solid #fecaca', background: '#fff5f5', cursor: 'pointer', color: '#dc2626', marginTop: i === 0 ? 22 : 0 }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setServices([...services, { service_type_id: '', quantity: '', unit_price: '', observations: '' }])}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 6,
                  border: '1px dashed var(--color-border)',
                  background: 'transparent', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: '0.85rem',
                  color: 'var(--color-text-muted)', alignSelf: 'flex-start',
                }}
              >
                <Plus size={14} /> Adicionar serviço
              </button>
            </Card>

            <Card style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <SectionTitle title="Vendas" />
              {sales.map((s, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 80px 100px 36px', gap: 8, alignItems: 'end' }}>
                  <Field label={i === 0 ? 'Produto' : ''}>
                    <input
                      value={s.product_id}
                      onChange={(e) => setSales(sales.map((x, j) => j === i ? { ...x, product_id: e.target.value } : x))}
                      placeholder="ID do produto"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label={i === 0 ? 'Qtd' : ''}>
                    <input
                      type="number"
                      value={s.quantity}
                      onChange={(e) => setSales(sales.map((x, j) => j === i ? { ...x, quantity: e.target.value } : x))}
                      placeholder="0"
                      style={inputStyle}
                    />
                  </Field>
                  <Field label={i === 0 ? 'Valor unit.' : ''}>
                    <input
                      type="number"
                      value={s.unit_price}
                      onChange={(e) => setSales(sales.map((x, j) => j === i ? { ...x, unit_price: e.target.value } : x))}
                      placeholder="R$ 0,00"
                      style={inputStyle}
                    />
                  </Field>
                  <button
                    onClick={() => setSales(sales.filter((_, j) => j !== i))}
                    style={{ padding: 8, borderRadius: 6, border: '1px solid #fecaca', background: '#fff5f5', cursor: 'pointer', color: '#dc2626', marginTop: i === 0 ? 22 : 0 }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setSales([...sales, { product_id: '', quantity: '', unit_price: '' }])}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px', borderRadius: 6,
                  border: '1px dashed var(--color-border)',
                  background: 'transparent', cursor: 'pointer',
                  fontFamily: 'inherit', fontSize: '0.85rem',
                  color: 'var(--color-text-muted)', alignSelf: 'flex-start',
                }}
              >
                <Plus size={14} /> Adicionar venda
              </button>
            </Card>
          </>
        )}

        {/* Botão submit */}
        <button
          onClick={() => mutate()}
          disabled={!canSubmit}
          style={{
            padding: '12px',
            borderRadius: 6,
            border: 'none',
            background: isSuccess ? '#238821' : !canSubmit ? 'var(--color-border)' : 'var(--color-primary)',
            color: '#fff',
            fontFamily: 'inherit',
            fontSize: '1rem',
            fontWeight: 600,
            cursor: canSubmit ? 'pointer' : 'not-allowed',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            transition: 'background 0.2s',
          }}
        >
          {isPending && <Loader2 size={18} className="animate-spin" />}
          {isSuccess && <CheckCircle size={18} />}
          {isSuccess ? 'Visita registrada!' : isPending ? 'Salvando…' : 'Registrar visita'}
        </button>
      </div>
    </div>
  )
}
