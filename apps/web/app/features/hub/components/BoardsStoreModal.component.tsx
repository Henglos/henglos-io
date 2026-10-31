import { listPackages } from "@shared/api";
import { Input, Select, Table } from "@henglosio/ui";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";

type BoardsStoreModelProps = {

	onSelect: (boardId: string) => void;

}

export const BoardsStoreModel: React.FC<BoardsStoreModelProps> = ({ onSelect }) => {

	const [query, setQuery] = useState<string>("");

	const { data, isLoading, error } = useQuery({
		queryKey: ["packages", "board", query],
		queryFn: async () => listPackages({ q: query, type: "board" })
	});

	return (

		<div className="flex flex-col gap-2 p-2">

			<Input.Root>
				<Input.Field
					placeholder="Search board..."
				/>
			</Input.Root>

			<Table.Root>

				{
					data?.map(board => (

						<Table.Row className="flex flex-col gap-2">

							<div className="flex justify-between">
								<span className="text-fg">{board.name}</span>
								<span className="text-fg-muted">{board.author}</span>
							</div>

							<span className="text-fg-muted">{board.description}</span>

							<div className="flex gap-2">

								<Select.Root>
									<Select.Trigger placeholder="version" />
									<Select.Content>
										{null}
									</Select.Content>
								</Select.Root>

							</div>

						</Table.Row>

					))
				}

			</Table.Root>

		</div>

	);

}
