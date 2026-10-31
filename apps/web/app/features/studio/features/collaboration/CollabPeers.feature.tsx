import { useAtomValue } from "jotai";
import { Avatar, Text, Tooltip } from "@henglosio/ui";
import { CollabPeersAtom, type CollabPeer } from "../../store/collab.store";

// One avatar per person — the same user in two tabs is one presence.
const uniqueUsers = (peers: CollabPeer[]) =>
	[...new Map(peers.map(peer => [peer.user.id, peer.user])).values()];

export const CollabPeers = () => {

	const users = uniqueUsers(useAtomValue(CollabPeersAtom));
	if (users.length === 0) return null;

	return (

		<Tooltip.Provider delayDuration={300}>
			<Avatar.Stack max={4}>
				{users.map(user => (
					<Tooltip.Root key={user.id}>
						<Tooltip.Trigger asChild>
							<Avatar.Root size="sm" className="border-2" style={{ borderColor: user.color }}>
								<Avatar.Fallback>{user.name.slice(0, 2).toUpperCase()}</Avatar.Fallback>
							</Avatar.Root>
						</Tooltip.Trigger>
						<Tooltip.Content side="bottom">
							<Text variant="high" size="xs">{user.name}</Text>
						</Tooltip.Content>
					</Tooltip.Root>
				))}
			</Avatar.Stack>
		</Tooltip.Provider>

	);

}
