import { VoteWeb3Provider } from "@/components/vote/VoteWeb3Provider";

export default function VoteLayout({ children }: { children: React.ReactNode }) {
  return <VoteWeb3Provider>{children}</VoteWeb3Provider>;
}
