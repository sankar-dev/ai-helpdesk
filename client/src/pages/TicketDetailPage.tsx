import { useParams } from 'react-router'

export default function TicketDetailPage() {
  const { id } = useParams()
  return <h1 className="text-2xl font-semibold">Ticket {id}</h1>
}
